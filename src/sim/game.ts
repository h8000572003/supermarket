import { FIXTURES, SELL_REFUND_RATE } from './catalog/fixtures';
import type { FixtureKind } from './catalog/fixtures';
import { CATEGORIES, PRODUCTS, STARTING_CATEGORIES, productById } from './catalog/products';
import type { CategoryId } from './catalog/products';
import { MAX_STEPS_PER_TICK, STEPS_PER_DAY, STEP_MS, minuteOfDay } from './clock/clock';
import type { Speed } from './clock/clock';
import { orderTotal } from './economy/purchase-order';
import type { OrderLine, PurchaseOrder } from './economy/purchase-order';
import { isExpired } from './inventory/expiry';
import { Inventory } from './inventory/inventory';
import type { Slot } from './inventory/inventory';
import { DayLedger } from './report/daily-report';
import type { DailyReport, WasteLine } from './report/daily-report';
import { Rng } from './rng';
import { rotateClockwise } from './store/geometry';
import type { Placement } from './store/geometry';
import { StoreLayout } from './store/store-layout';
import type { Fixture, PlacementError } from './store/store-layout';

/** 營業日的階段：準備階段 → 營業時段 → 每日結算 */
export type Phase = 'prep' | 'open' | 'report';

export type CommandError =
  | PlacementError
  /** 只能在準備階段執行 */
  | 'not-prep-phase'
  /** 只能在每日結算時執行 */
  | 'not-report-phase'
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
/** 每個營業日的租金 */
export const DAILY_RENT = 1_500;

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
  private _step = 0;
  private _speed: Speed = 1;
  private stepRemainderMs = 0;
  private ledger = new DayLedger(1, STARTING_FUNDS);
  private _lastReport: DailyReport | null = null;
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

  /** 營業時段已進行的步數 */
  get step(): number {
    return this._step;
  }

  /** 遊戲內時刻（一天中的分鐘數）；準備階段為開店時刻 */
  get minuteOfDay(): number {
    return minuteOfDay(this._step);
  }

  get speed(): Speed {
    return this._speed;
  }

  /** 最近一次的每日結算；每日結算階段時即為當日 */
  get lastReport(): DailyReport | null {
    return this._lastReport;
  }

  /** 已下單、尚未送達的進貨單 */
  get pendingOrders(): readonly PurchaseOrder[] {
    return this._pendingOrders;
  }

  isUnlocked(category: CategoryId): boolean {
    return this.unlocked.has(category);
  }

  /** 解鎖商品類別（里程碑獎勵，M6 由進度系統呼叫） */
  unlockCategory(category: CategoryId): void {
    if (this.unlocked.has(category)) return;
    this.unlocked.add(category);
    this.changed();
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
    this.ledger.purchases += total;
    this.changed();
    return ok(order);
  }

  /** 準備階段 → 營業時段 */
  openStore(): Result {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    this._phase = 'open';
    this._step = 0;
    this.stepRemainderMs = 0;
    this.changed();
    return ok(undefined);
  }

  setSpeed(speed: Speed): void {
    if (this._speed === speed) return;
    this._speed = speed;
    this.changed();
  }

  /** 由畫面迴圈呼叫：依倍速把現實時間換算成固定步數推進 */
  tick(realDtMs: number): void {
    if (this._phase !== 'open' || this._speed === 0) return;
    this.stepRemainderMs += realDtMs * this._speed;
    let steps = Math.min(Math.floor(this.stepRemainderMs / STEP_MS), MAX_STEPS_PER_TICK);
    this.stepRemainderMs = Math.min(this.stepRemainderMs - steps * STEP_MS, STEP_MS);
    const minuteBefore = Math.floor(this.minuteOfDay);
    while (steps-- > 0 && this._phase === 'open') this.advanceStep();
    if (this._phase === 'open' && Math.floor(this.minuteOfDay) !== minuteBefore) this.changed();
  }

  /** 推進一個固定步長；營業時段結束時打烊 */
  private advanceStep(): void {
    this._step++;
    if (this._step >= STEPS_PER_DAY) this.closeStore();
  }

  /** 營業時段 → 每日結算：支付固定支出並產生結算 */
  private closeStore(): void {
    this.ledger.rent = DAILY_RENT;
    this._funds -= DAILY_RENT;
    this._phase = 'report';
    this._lastReport = this.ledger.toReport(this._funds);
    this.changed();
  }

  /** 每日結算 → 下一個營業日的準備階段：送達進貨、報廢過期鮮食 */
  startNextDay(): Result {
    if (this._phase !== 'report') return fail('not-report-phase');
    this._day++;
    this._phase = 'prep';
    this._step = 0;
    this.ledger = new DayLedger(this._day, this._funds);
    for (const order of this._pendingOrders) {
      this.inventory.receive(order.lines.map((l) => ({ productId: l.productId, qty: l.qty, arrivedDay: this._day })));
    }
    this._pendingOrders = [];
    this.ledger.waste = summarizeWaste(this.inventory.removeBatches((b) => isExpired(b, this._day)));
    this.changed();
    return ok(undefined);
  }

  /** 今天開始時報廢的商品 */
  get todayWaste(): readonly WasteLine[] {
    return this.ledger.waste;
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

function summarizeWaste(batches: readonly { productId: string; qty: number }[]): WasteLine[] {
  const qty = new Map<string, number>();
  for (const b of batches) qty.set(b.productId, (qty.get(b.productId) ?? 0) + b.qty);
  return [...qty].map(([productId, q]) => ({ productId, qty: q, cost: q * (productById(productId)?.cost ?? 0) }));
}

export function sellRefund(kind: FixtureKind): number {
  return Math.floor(FIXTURES[kind].price * SELL_REFUND_RATE);
}
