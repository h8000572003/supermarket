import { FIXTURES, SELL_REFUND_RATE } from './catalog/fixtures';
import type { FixtureKind } from './catalog/fixtures';
import { CATEGORIES, PRODUCTS, STARTING_CATEGORIES, productById } from './catalog/products';
import type { CategoryId } from './catalog/products';
import { orderTotal } from './economy/purchase-order';
import type { OrderLine, PurchaseOrder } from './economy/purchase-order';
import { Inventory } from './inventory/inventory';
import type { Slot } from './inventory/inventory';
import { Rng } from './rng';
import { rotateClockwise } from './store/geometry';
import type { Placement } from './store/geometry';
import { StoreLayout } from './store/store-layout';
import type { Fixture, PlacementError } from './store/store-layout';

export type Phase = 'prep';

export type CommandError =
  | PlacementError
  /** 只能在準備階段執行 */
  | 'not-prep-phase'
  /** 資金不足 */
  | 'insufficient-funds'
  /** 找不到指定的設施 */
  | 'unknown-fixture'
  /** 不是陳列櫃或格位不存在 */
  | 'invalid-slot'
  /** 找不到指定的商品 */
  | 'unknown-product'
  /** 商品類別尚未解鎖 */
  | 'category-locked'
  /** 商品類別不能放在這種陳列櫃 */
  | 'wrong-display'
  /** 售價不合法 */
  | 'invalid-price'
  /** 進貨單沒有任何品項 */
  | 'empty-order'
  /** 低於最低訂購量 */
  | 'below-min-order';

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: CommandError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: CommandError): Result<never> => ({ ok: false, error });

export const STARTING_FUNDS = 30_000;

export interface GameOptions {
  seed: number;
}

/** 模擬核心的唯一入口：commands 改變狀態、唯讀 getter 查詢、subscribe 監聽變化 */
export class Game {
  readonly rng: Rng;
  private readonly layout = new StoreLayout();
  private readonly inventory = new Inventory();
  private _funds = STARTING_FUNDS;
  private _phase: Phase = 'prep';
  private _day = 1;
  private readonly unlocked = new Set<CategoryId>(STARTING_CATEGORIES);
  private readonly salePrices = new Map(PRODUCTS.map((p) => [p.id, p.suggestedPrice]));
  private _pendingOrders: PurchaseOrder[] = [];
  private nextFixtureId = 1;
  private _version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: GameOptions) {
    this.rng = Rng.fromSeed(options.seed);
  }

  get funds(): number {
    return this._funds;
  }

  get phase(): Phase {
    return this._phase;
  }

  /** 目前是第幾個營業日（從 1 開始） */
  get day(): number {
    return this._day;
  }

  /** 已下單、尚未送達的進貨單 */
  get pendingOrders(): readonly PurchaseOrder[] {
    return this._pendingOrders;
  }

  isUnlocked(category: CategoryId): boolean {
    return this.unlocked.has(category);
  }

  salePrice(productId: string): number | undefined {
    return this.salePrices.get(productId);
  }

  backroomQty(productId: string): number {
    return this.inventory.backroomQty(productId);
  }

  slots(fixtureId: string): readonly Slot[] {
    return this.inventory.slots(fixtureId);
  }

  /** 每次狀態改變遞增，供 UI 判斷是否需要重繪 */
  get version(): number {
    return this._version;
  }

  get fixtures(): readonly Fixture[] {
    return this.layout.list();
  }

  fixture(id: string): Fixture | undefined {
    return this.layout.get(id);
  }

  fixtureAt(p: { x: number; y: number }): Fixture | undefined {
    return this.layout.fixtureAt(p);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 預檢擺放（含資金）；movingId 表示移動既有設施，不需付費 */
  checkPlacement(kind: FixtureKind, placement: Placement, movingId?: string): CommandError | null {
    if (this._phase !== 'prep') return 'not-prep-phase';
    if (!movingId && this._funds < FIXTURES[kind].price) return 'insufficient-funds';
    return this.layout.validate(kind, placement, movingId);
  }

  placeFixture(kind: FixtureKind, placement: Placement): Result<Fixture> {
    const error = this.checkPlacement(kind, placement);
    if (error) return fail(error);
    const fixture: Fixture = { id: `f${this.nextFixtureId++}`, kind, ...placement };
    this.layout.put(fixture);
    this.inventory.addDisplay(fixture.id, FIXTURES[kind].slots);
    this._funds -= FIXTURES[kind].price;
    this.changed();
    return ok(fixture);
  }

  moveFixture(id: string, placement: Placement): Result<Fixture> {
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    const error = this.checkPlacement(current.kind, placement, id);
    if (error) return fail(error);
    const moved: Fixture = { ...current, ...placement };
    this.layout.put(moved);
    this.changed();
    return ok(moved);
  }

  rotateFixture(id: string): Result<Fixture> {
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    return this.moveFixture(id, { origin: current.origin, facing: rotateClockwise(current.facing) });
  }

  /** 出售設施，回收購買價的一部分，格位上的商品退回倉庫；回傳回收金額 */
  sellFixture(id: string): Result<number> {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    const refund = sellRefund(current.kind);
    this.layout.remove(id);
    this.inventory.removeDisplay(id);
    this._funds += refund;
    this.changed();
    return ok(refund);
  }

  /** 指定格位的商品（null 為清空）；原本的陳列庫存退回倉庫 */
  assignSlot(fixtureId: string, index: number, productId: string | null): Result {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    const fixture = this.layout.get(fixtureId);
    if (!fixture || !this.inventory.slot(fixtureId, index)) return fail('invalid-slot');
    if (productId !== null) {
      const product = productById(productId);
      if (!product) return fail('unknown-product');
      if (!this.unlocked.has(product.category)) return fail('category-locked');
      if (CATEGORIES[product.category].display !== fixture.kind) return fail('wrong-display');
    }
    this.inventory.assignSlot(fixtureId, index, productId);
    this.changed();
    return ok(undefined);
  }

  setSalePrice(productId: string, price: number): Result {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    if (!productById(productId)) return fail('unknown-product');
    if (!Number.isInteger(price) || price <= 0) return fail('invalid-price');
    this.salePrices.set(productId, price);
    this.changed();
    return ok(undefined);
  }

  /** 下進貨單並立即付款（商品金額 + 運費） */
  submitPurchaseOrder(lines: readonly OrderLine[]): Result<PurchaseOrder> {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    const nonEmpty = lines.filter((l) => l.qty > 0);
    if (nonEmpty.length === 0) return fail('empty-order');
    for (const line of nonEmpty) {
      const product = productById(line.productId);
      if (!product) return fail('unknown-product');
      if (!this.unlocked.has(product.category)) return fail('category-locked');
      if (!Number.isInteger(line.qty) || line.qty < product.minOrder) return fail('below-min-order');
    }
    const total = orderTotal(nonEmpty);
    if (this._funds < total) return fail('insufficient-funds');
    const order: PurchaseOrder = { lines: nonEmpty, placedDay: this._day, total };
    this._pendingOrders = [...this._pendingOrders, order];
    this._funds -= total;
    this.changed();
    return ok(order);
  }

  /**
   * 進入下一個營業日的準備階段：送達進貨單。
   * M3 會改由時鐘在營業時段結束後呼叫。
   */
  advanceDay(): void {
    this._day++;
    for (const order of this._pendingOrders) {
      this.inventory.receive(order.lines.map((l) => ({ productId: l.productId, qty: l.qty, arrivedDay: this._day })));
    }
    this._pendingOrders = [];
    this.changed();
  }

  /** 店員從倉庫補滿格位；回傳補上的數量（M5 由店員呼叫） */
  restockSlot(fixtureId: string, index: number): number {
    const fixture = this.layout.get(fixtureId);
    if (!fixture) return 0;
    const moved = this.inventory.restockSlot(fixtureId, index, FIXTURES[fixture.kind].slotCapacity);
    if (moved > 0) this.changed();
    return moved;
  }

  private changed(): void {
    this._version++;
    for (const listener of this.listeners) listener();
  }
}

export function sellRefund(kind: FixtureKind): number {
  return Math.floor(FIXTURES[kind].price * SELL_REFUND_RATE);
}
