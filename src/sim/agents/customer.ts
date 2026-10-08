import type { CategoryId } from '../catalog/products';
import type { Batch } from '../inventory/batch';
import type { Passable } from '../pathfinding/grid';
import type { Rng } from '../rng';
import type { GridPoint } from '../store/layout';
import { purchaseProbability } from './demand';
import { Walker } from './walker';

/** 顧客每步移動的格數 */
export const CUSTOMER_SPEED = 0.2;
/** 在陳列櫃前挑選所需步數 */
export const BROWSE_STEPS = 8;
/** 同一類別最多嘗試幾個格位（走到時被拿光會換一格） */
const MAX_TRIES_PER_CATEGORY = 2;
/** 缺貨提示顯示的步數 */
const STOCKOUT_FLASH_STEPS = 15;

export type CustomerActivity = 'shopping' | 'browsing' | 'to-queue' | 'queued' | 'paying' | 'leaving' | 'gone';

/** 離店結果：結帳、空手離開（缺貨或嫌貴）、放棄排隊 */
export type CustomerOutcome = 'served' | 'left-empty' | 'abandoned';

export interface ShelfOffer {
  readonly fixtureId: string;
  readonly slotIndex: number;
  readonly accessTile: GridPoint;
}

export interface BasketItem {
  readonly batches: readonly Batch[];
  readonly productId: string;
  readonly price: number;
}

/** 顧客在營業時段中需要的外部能力，由 Game 提供 */
export interface CustomerWorld {
  readonly entrance: GridPoint;
  readonly isWalkable: Passable;
  readonly rng: Rng;
  /** 陳列此類別商品且有陳列庫存的格位 */
  offersFor(category: CategoryId): ShelfOffer[];
  /** 格位上的商品與數量 */
  slotContent(fixtureId: string, slotIndex: number): { productId: string; qty: number } | null;
  pricing(productId: string): { salePrice: number; suggestedPrice: number };
  takeOne(fixtureId: string, slotIndex: number): Batch[];
  returnToBackroom(batches: readonly Batch[]): void;
  /** 加入某台收銀台的隊伍；店內沒有收銀台時回傳 false */
  joinQueue(customer: CustomerAgent): boolean;
  leaveQueue(customer: CustomerAgent): void;
  /** 顧客在隊伍中應站的格子 */
  queueTile(customer: CustomerAgent): GridPoint | null;
}

const key = (p: GridPoint) => `${p.x},${p.y}`;

export class CustomerAgent extends Walker {
  activity: CustomerActivity = 'shopping';
  outcome: CustomerOutcome | null = null;
  satisfaction = 100;
  readonly basket: BasketItem[] = [];
  stockouts = 0;
  priceRejects = 0;
  waitSteps = 0;
  patience: number;
  private listIndex = 0;
  private tried = new Set<string>();
  private target: ShelfOffer | null = null;
  private queueTarget: GridPoint | null = null;
  private timer = 0;
  private stockoutFlash = 0;

  constructor(
    id: string,
    readonly shoppingList: readonly CategoryId[],
    readonly maxPatience: number,
    world: CustomerWorld,
  ) {
    super(id, world.entrance, CUSTOMER_SPEED);
    this.patience = maxPatience;
    this.nextCategory(world);
  }

  /** 畫面用的心情提示 */
  get mood(): 'stockout' | 'impatient' | null {
    if (this.stockoutFlash > 0) return 'stockout';
    if ((this.activity === 'to-queue' || this.activity === 'queued') && this.patience < this.maxPatience * 0.4) {
      return 'impatient';
    }
    return null;
  }

  /** 是否已站在隊伍的指定位置 */
  get atQueueSpot(): boolean {
    return this.activity === 'queued';
  }

  update(world: CustomerWorld): void {
    this.beginStep();
    if (this.stockoutFlash > 0) this.stockoutFlash--;

    switch (this.activity) {
      case 'shopping':
        if (this.move()) {
          this.activity = 'browsing';
          this.timer = BROWSE_STEPS;
        }
        return;
      case 'browsing':
        if (--this.timer > 0) return;
        this.pickFromShelf(world);
        return;
      case 'to-queue':
      case 'queued':
        this.waitInQueue(world);
        return;
      case 'paying':
        return;
      case 'leaving':
        if (this.move()) this.activity = 'gone';
        return;
      case 'gone':
        return;
    }
  }

  /** 收銀完成 */
  paid(world: CustomerWorld): void {
    this.satisfaction = clamp(100 - 35 * this.stockouts - 15 * this.priceRejects - Math.max(0, this.waitSteps - 30) * 0.5);
    this.leave('served', world);
  }

  /** 打烊時仍在店內：未結帳的商品退回倉庫 */
  forceLeave(world: CustomerWorld): void {
    if (!this.outcome) {
      world.returnToBackroom(this.basket.flatMap((b) => b.batches));
      this.satisfaction = 0;
      this.outcome = this.basket.length > 0 ? 'abandoned' : 'left-empty';
    }
    this.activity = 'gone';
  }

  private nextCategory(world: CustomerWorld): void {
    while (this.listIndex < this.shoppingList.length) {
      const category = this.shoppingList[this.listIndex] as CategoryId;
      const offers =
        this.tried.size < MAX_TRIES_PER_CATEGORY
          ? world.offersFor(category).filter((o) => !this.tried.has(`${o.fixtureId}#${o.slotIndex}`))
          : [];
      if (offers.length > 0) {
        this.target = world.rng.pick(offers);
        this.activity = 'shopping';
        this.walkTo(this.target.accessTile, world.isWalkable);
        return;
      }
      this.stockouts++;
      this.stockoutFlash = STOCKOUT_FLASH_STEPS;
      this.advanceList();
    }
    this.finishShopping(world);
  }

  private pickFromShelf(world: CustomerWorld): void {
    const t = this.target;
    const content = t && world.slotContent(t.fixtureId, t.slotIndex);
    if (!t || !content || content.qty === 0) {
      // 走到時已被拿光：換一格再試
      if (t) this.tried.add(`${t.fixtureId}#${t.slotIndex}`);
      return this.nextCategory(world);
    }
    const { salePrice, suggestedPrice } = world.pricing(content.productId);
    if (world.rng.chance(purchaseProbability(salePrice, suggestedPrice))) {
      this.basket.push({ batches: world.takeOne(t.fixtureId, t.slotIndex), productId: content.productId, price: salePrice });
    } else {
      this.priceRejects++;
    }
    this.advanceList();
    this.nextCategory(world);
  }

  private advanceList(): void {
    this.listIndex++;
    this.tried = new Set();
    this.target = null;
  }

  private finishShopping(world: CustomerWorld): void {
    if (this.basket.length === 0) {
      this.satisfaction = Math.min(30, clamp(100 - 35 * this.stockouts - 15 * this.priceRejects));
      return this.leave('left-empty', world);
    }
    if (!world.joinQueue(this)) {
      world.returnToBackroom(this.basket.flatMap((b) => b.batches));
      this.satisfaction = 0;
      return this.leave('abandoned', world);
    }
    this.activity = 'to-queue';
    this.queueTarget = null;
    this.waitInQueue(world);
  }

  private waitInQueue(world: CustomerWorld): void {
    this.waitSteps++;
    if (--this.patience <= 0) {
      world.leaveQueue(this);
      world.returnToBackroom(this.basket.flatMap((b) => b.batches));
      this.satisfaction = 0;
      return this.leave('abandoned', world);
    }
    const spot = world.queueTile(this);
    if (spot && (!this.queueTarget || key(spot) !== key(this.queueTarget))) {
      this.queueTarget = spot;
      this.activity = 'to-queue';
      this.walkTo(spot, world.isWalkable);
    }
    if (this.activity === 'to-queue' && this.move()) this.activity = 'queued';
  }

  private leave(outcome: CustomerOutcome, world: CustomerWorld): void {
    this.outcome = outcome;
    this.activity = 'leaving';
    this.walkTo(world.entrance, world.isWalkable);
  }
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
