import { FIXTURES, SELL_REFUND_RATE } from './catalog/fixtures';
import type { FixtureKind } from './catalog/fixtures';
import { CATEGORIES, PRODUCTS, STARTING_CATEGORIES, productById } from './catalog/products';
import type { CategoryId } from './catalog/products';
import { Checkout, nearestAvailable } from './agents/checkout';
import type { RegisterSpot } from './agents/checkout';
import { CustomerAgent } from './agents/customer';
import { slotKey } from './agents/restock';
import type { CustomerWorld } from './agents/customer';
import { LAST_ENTRY_BEFORE_CLOSE, MAX_CUSTOMERS_IN_STORE, arrivalsPerHour, rollShoppingList } from './agents/demand';
import { StaffAgent } from './agents/staff';
import type { StaffWorld } from './agents/staff';
import { CLOSE_MINUTE, MAX_STEPS_PER_TICK, MINUTES_PER_STEP, STEPS_PER_DAY, STEP_MS, minuteOfDay } from './clock/clock';
import type { Speed } from './clock/clock';
import { goodsTotal, orderTotal } from './economy/purchase-order';
import { FlashSales, MAX_FLASH_SALES, flashSalePrice, isFlashSaleTier } from './economy/flash-sale';
import type { FlashSale, FlashSaleTier } from './economy/flash-sale';
import type { OrderLine, PurchaseOrder } from './economy/purchase-order';
import {
  RUSH_DELIVERY_MINUTES,
  RUSH_LAST_ORDER_MINUTE,
  RUSH_ORDERS_PER_DAY,
  STANDARD_RUSH_TERMS,
} from './economy/rush-order';
import type { RushOrder, RushOrderTerms } from './economy/rush-order';
import { canAfford, incidentDefinition, scheduleIncidents } from './incidents/incidents';
import type {
  IncidentContext,
  IncidentEffect,
  IncidentKind,
  IncidentRecord,
  PendingIncident,
  ScheduledIncident,
} from './incidents/incidents';
import { isExpired } from './inventory/expiry';
import { Inventory } from './inventory/inventory';
import type { Slot } from './inventory/inventory';
import {
  BANKRUPTCY_DAYS,
  MILESTONES,
  STARTING_REPUTATION,
  arrivalMultiplier,
  nextReputation,
} from './progress/progress';
import type { MilestoneContext } from './progress/progress';
import { DayLedger } from './report/daily-report';
import type { DailyReport, WasteLine } from './report/daily-report';
import { Rng } from './rng';
import { SNAPSHOT_VERSION } from './snapshot';
import type { GameSnapshot } from './snapshot';
import { totalQty } from './inventory/batch';
import { customerAccessTiles, rotateClockwise, slotAccessTile, staffAccessTiles } from './store/geometry';
import type { Facing } from './store/geometry';
import { BACKROOM_DOOR, ENTRANCE } from './store/layout';
import type { GridPoint } from './store/layout';
import type { Placement } from './store/geometry';
import { StoreLayout } from './store/store-layout';
import type { Fixture, PlacementError } from './store/store-layout';

/** 營業日的階段：準備階段 → 營業時段 → 每日結算；破產後為 gameover */
export type Phase = 'prep' | 'open' | 'report' | 'gameover';

export type CommandError =
  | PlacementError
  /** 只能在準備階段執行 */
  | 'not-prep-phase'
  /** 只能在營業時段執行（限時特價、緊急叫貨等暫時性指令，見 ADR 0003） */
  | 'not-open-hours'
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
  | 'below-min-order'
  /** 今天的緊急叫貨次數已用完 */
  | 'rush-limit-reached'
  /** 已過緊急叫貨的最後下單時刻 */
  | 'rush-too-late'
  /** 這次叫貨不能訂這個類別的商品 */
  | 'wrong-category'
  /** 店員人數已達上限 */
  | 'staff-full'
  /** 找不到指定的店員 */
  | 'unknown-staff'
  /** 派工標記已達上限 */
  | 'dispatch-full'
  /** 這個目標已經派工 */
  | 'already-dispatched'
  /** 這個目標沒有派工 */
  | 'not-dispatched'
  /** 格位沒有指定商品 */
  | 'slot-unassigned'
  /** 格位已經補滿 */
  | 'slot-full'
  /** 倉庫沒有這個商品 */
  | 'no-backroom-stock'
  /** 限時特價只能選 9 折、8 折、7 折 */
  | 'invalid-discount'
  /** 這個商品已在限時特價中 */
  | 'flash-sale-active'
  /** 同時進行的限時特價已達上限 */
  | 'flash-sale-limit'
  /** 目前沒有等待選擇的狀況 */
  | 'no-pending-incident'
  /** 狀況沒有這個選項 */
  | 'invalid-incident-option';

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: CommandError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: CommandError): Result<never> => ({ ok: false, error });

/** 指令所需的階段：準備階段的指令，或營業時段的暫時性指令（ADR 0003） */
export type CommandPhase = 'prep' | 'open';

const PHASE_ERRORS: Record<CommandPhase, CommandError> = {
  prep: 'not-prep-phase',
  open: 'not-open-hours',
};

/** 共用的階段檢查：目前階段不是指令所需的階段時回傳錯誤碼，否則回傳 null */
export function phaseError(current: Phase, required: CommandPhase): CommandError | null {
  return current === required ? null : PHASE_ERRORS[required];
}

export const STARTING_FUNDS = 30_000;
/** 每個營業日的租金 */
export const DAILY_RENT = 600;
/** 每位店員的日薪 */
export const DAILY_WAGE = 600;
export const MAX_STAFF = 6;
/** 同時最多的派工標記數 */
export const MAX_DISPATCHES = 2;

/** 派工的目標：某個陳列櫃的格位，或某台收銀台 */
export type DispatchTarget =
  | { readonly kind: 'slot'; readonly fixtureId: string; readonly slotIndex: number }
  | { readonly kind: 'register'; readonly registerId: string };

const sameTarget = (a: DispatchTarget, b: DispatchTarget): boolean =>
  a.kind === 'slot'
    ? b.kind === 'slot' && a.fixtureId === b.fixtureId && a.slotIndex === b.slotIndex
    : b.kind === 'register' && a.registerId === b.registerId;

/** 模擬中發生、值得畫面或音效回應的瞬間事件 */
export type GameEvent =
  | { readonly type: 'store-opened' }
  | { readonly type: 'sale'; readonly amount: number }
  | { readonly type: 'abandon' }
  | { readonly type: 'rush-delivered'; readonly lines: readonly OrderLine[] }
  | { readonly type: 'day-ended'; readonly bankrupt: boolean }
  | { readonly type: 'milestone'; readonly id: string }
  | {
      readonly type: 'flash-sale-started';
      readonly productId: string;
      readonly tier: FlashSaleTier;
      readonly price: number;
    }
  /** 限時特價到期、恢復售價（打烊時的結束不另外通知） */
  | { readonly type: 'flash-sale-ended'; readonly productId: string }
  /** 狀況發生，遊戲停下等店長選擇 */
  | { readonly type: 'incident-started'; readonly kind: IncidentKind }
  /** 狀況已處理，遊戲繼續 */
  | { readonly type: 'incident-resolved'; readonly kind: IncidentKind; readonly option: number };

/** 受雇的店員（跨營業日存在） */
export interface Staff {
  readonly id: string;
  readonly name: string;
}

const STAFF_NAMES = ['小林', '阿明', '小美', '阿傑', '小芳', '阿凱', '小婷', '阿豪'];

/** 顧客排隊耐心（步數）的範圍 */
const PATIENCE_RANGE: readonly [number, number] = [80, 140];

/** 緊急叫貨下單到送達的步數 */
const RUSH_DELIVERY_STEPS = Math.round(RUSH_DELIVERY_MINUTES / MINUTES_PER_STEP);

/** 營業中待送達的緊急叫貨與預計送達的步數 */
interface PendingRush {
  readonly order: RushOrder;
  readonly etaStep: number;
}

const FACING_DIR: Record<Facing, GridPoint> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export interface GameOptions {
  seed: number;
  /** 是否有顧客進店；預設 true。測試只想看店員行為時可關閉 */
  customerArrivals?: boolean;
  /** 起始口碑（0–100）；預設 STARTING_REPUTATION */
  startingReputation?: number;
  /** 起始資金；預設 STARTING_FUNDS。供測試布置情境用 */
  startingFunds?: number;
}

/** 模擬核心的唯一入口：commands 改變狀態、唯讀 getter 查詢、subscribe 監聽變化 */
export class Game {
  readonly rng: Rng;
  private readonly layout = new StoreLayout();
  private inventory = new Inventory();
  private _funds = STARTING_FUNDS;
  private _phase: Phase = 'prep';
  private _day = 1;
  private readonly unlocked = new Set<CategoryId>(STARTING_CATEGORIES);
  private readonly salePrices = new Map(PRODUCTS.map((p) => [p.id, p.suggestedPrice]));
  private readonly flashSaleState = new FlashSales();
  private _pendingOrders: PurchaseOrder[] = [];
  private pendingRush: PendingRush[] = [];
  private rushOrdersUsed = 0;
  private _step = 0;
  private _speed: Speed = 1;
  private stepRemainderMs = 0;
  private ledger = new DayLedger(1, STARTING_FUNDS);
  private _lastReport: DailyReport | null = null;
  private _reputation = STARTING_REPUTATION;
  private totalRevenue = 0;
  private bestServed = 0;
  private negativeDays = 0;
  private readonly achieved = new Set<string>();
  private _staff: Staff[] = [];
  private nextStaffId = 1;
  private agents: StaffAgent[] = [];
  private customers: CustomerAgent[] = [];
  private nextCustomerId = 1;
  private checkout = new Checkout([], () => false);
  private readonly reservedSlots = new Set<string>();
  /** 營業中的派工標記（瞬時狀態，不存檔；打烊時清除） */
  private _dispatches: DispatchTarget[] = [];
  private nextFixtureId = 1;
  private _version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  /** 今天還沒發生的狀況（依時刻排序） */
  private incidentQueue: ScheduledIncident[] = [];
  private _pendingIncident: { readonly kind: IncidentKind; readonly minute: number } | null = null;
  /** 前一個營業日發生過的狀況種類（隔天不重複） */
  private previousIncidentKinds: readonly IncidentKind[] = [];

  private readonly customerWorld: CustomerWorld;
  private readonly customerArrivals: boolean;

  constructor(options: GameOptions) {
    this.rng = Rng.fromSeed(options.seed);
    this.customerArrivals = options.customerArrivals ?? true;
    this._reputation = options.startingReputation ?? STARTING_REPUTATION;
    this._funds = options.startingFunds ?? STARTING_FUNDS;
    this.ledger = new DayLedger(1, this._funds);
    this.customerWorld = this.createCustomerWorld();
  }

  /** 準備階段的完整狀態（存檔用）；其他階段回傳 null */
  snapshot(): GameSnapshot | null {
    if (this._phase !== 'prep') return null;
    return {
      version: SNAPSHOT_VERSION,
      day: this._day,
      funds: this._funds,
      reputation: this._reputation,
      totalRevenue: this.totalRevenue,
      bestServed: this.bestServed,
      negativeDays: this.negativeDays,
      achieved: [...this.achieved],
      unlocked: [...this.unlocked],
      salePrices: [...this.salePrices],
      fixtures: this.layout.list(),
      nextFixtureId: this.nextFixtureId,
      inventory: this.inventory.snapshot(),
      staff: this._staff,
      nextStaffId: this.nextStaffId,
      pendingOrders: this._pendingOrders,
      rngState: this.rng.state,
      speed: this._speed,
      previousIncidentKinds: this.previousIncidentKinds,
      ledger: {
        fundsAtStart: this.ledger.fundsAtStart,
        purchases: this.ledger.purchases,
        fixtures: this.ledger.fixtures,
        waste: this.ledger.waste,
      },
    };
  }

  /** 從快照還原到準備階段 */
  static fromSnapshot(s: GameSnapshot, options: Omit<GameOptions, 'seed'> = {}): Game {
    // 以快照中的亂數狀態當作種子，接續同一個亂數序列
    const game = new Game({ ...options, seed: s.rngState });
    game._day = s.day;
    game._funds = s.funds;
    game._reputation = s.reputation;
    game.totalRevenue = s.totalRevenue;
    game.bestServed = s.bestServed;
    game.negativeDays = s.negativeDays;
    s.achieved.forEach((id) => game.achieved.add(id));
    game.unlocked.clear();
    s.unlocked.forEach((c) => game.unlocked.add(c));
    s.salePrices.forEach(([id, price]) => game.salePrices.set(id, price));
    s.fixtures.forEach((f) => game.layout.put(f));
    game.nextFixtureId = s.nextFixtureId;
    game.inventory = Inventory.fromSnapshot(s.inventory);
    game._staff = [...s.staff];
    game.nextStaffId = s.nextStaffId;
    game._pendingOrders = [...s.pendingOrders];
    game._speed = s.speed;
    game.previousIncidentKinds = [...s.previousIncidentKinds];
    game.ledger = new DayLedger(s.day, s.ledger.fundsAtStart);
    game.ledger.purchases = s.ledger.purchases;
    game.ledger.fixtures = s.ledger.fixtures;
    game.ledger.waste = [...s.ledger.waste];
    return game;
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

  /** 店舖口碑（0–100），決定來客倍率 */
  get reputation(): number {
    return this._reputation;
  }

  /** 里程碑判斷所需的累計成績 */
  get milestoneContext(): MilestoneContext {
    return { totalRevenue: this.totalRevenue, reputation: this._reputation, bestServed: this.bestServed };
  }

  isMilestoneAchieved(id: string): boolean {
    return this.achieved.has(id);
  }

  /** 目前步長內已累積的比例（0–1），供畫面在兩步之間內插位置 */
  get stepAlpha(): number {
    return this._phase === 'open' ? this.stepRemainderMs / STEP_MS : 0;
  }

  get staff(): readonly Staff[] {
    return this._staff;
  }

  /** 營業時段中的店員；其他階段為空 */
  get staffAgents(): readonly StaffAgent[] {
    return this.agents;
  }

  /** 營業時段中店內的顧客 */
  get customerAgents(): readonly CustomerAgent[] {
    return this.customers;
  }

  /** 收銀台目前排隊人數 */
  queueLength(registerId: string): number {
    return this.checkout.queueLength(registerId);
  }

  /** 營業中的派工標記 */
  get dispatches(): readonly DispatchTarget[] {
    return this._dispatches;
  }

  isDispatched(target: DispatchTarget): boolean {
    return this._dispatches.some((d) => sameTarget(d, target));
  }

  /** 今天到目前為止的帳目（營業中即時顯示用） */
  get todayRevenue(): number {
    return this.ledger.revenue;
  }

  /** 等待店長選擇的狀況；沒有時為 null。等待中 tick 不推進遊戲時間 */
  get pendingIncident(): PendingIncident | null {
    const p = this._pendingIncident;
    if (!p) return null;
    const def = incidentDefinition(p.kind);
    return {
      kind: p.kind,
      name: def.name,
      description: def.description,
      minute: p.minute,
      options: def.options.map((o) => ({ ...o, available: canAfford(this._funds, o.cost) })),
    };
  }

  /** 今天已處理的狀況 */
  get todayIncidents(): readonly IncidentRecord[] {
    return this.ledger.incidents;
  }

  /** 已下單、尚未送達的進貨單（含打烊前未送達、改於下一個營業日開店前送達的緊急叫貨） */
  get pendingOrders(): readonly PurchaseOrder[] {
    return this._pendingOrders;
  }

  /** 營業中已下單、尚未送達的緊急叫貨（含預計送達時刻） */
  get rushOrders(): readonly RushOrder[] {
    return this.pendingRush.map((r) => r.order);
  }

  /** 今天還能下幾次緊急叫貨 */
  get rushOrdersLeftToday(): number {
    return Math.max(0, RUSH_ORDERS_PER_DAY - this.rushOrdersUsed);
  }

  isUnlocked(category: CategoryId): boolean {
    return this.unlocked.has(category);
  }

  /** 直接解鎖商品類別（略過里程碑）；供測試布置情境用 */
  unlockCategory(category: CategoryId): void {
    if (this.unlocked.has(category)) return;
    this.unlocked.add(category);
    this.changed();
  }

  /** 店長設定的售價（不含限時特價） */
  salePrice(productId: string): number | undefined {
    return this.salePrices.get(productId);
  }

  /** 顧客當下看到的實際售價：限時特價中為折扣後價格 */
  currentPrice(productId: string): number | undefined {
    return this.flashSaleState.priceOf(productId) ?? this.salePrices.get(productId);
  }

  /** 進行中的限時特價與剩餘時間 */
  get flashSales(): readonly FlashSale[] {
    return this.flashSaleState.list(this._step);
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

  /** 監聽瞬間事件（成交、放棄、打烊…） */
  onEvent(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    for (const listener of this.eventListeners) listener(event);
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
    this.ledger.fixtures += FIXTURES[kind].price;
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
    this.ledger.fixtures -= refund;
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

  /** 下進貨單並立即付款（商品金額 + 運費）；第 1 天的開幕進貨立即送達，其餘隔天送達 */
  submitPurchaseOrder(lines: readonly OrderLine[]): Result<PurchaseOrder> {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    const checked = this.checkOrderLines(lines);
    if (!checked.ok) return checked;
    const nonEmpty = checked.value;
    const total = orderTotal(nonEmpty);
    if (this._funds < total) return fail('insufficient-funds');
    const order: PurchaseOrder = { lines: nonEmpty, placedDay: this._day, total };
    if (isOpeningDelivery(this._day)) this.deliver(order);
    else this._pendingOrders = [...this._pendingOrders, order];
    this._funds -= total;
    this.ledger.purchases += total;
    this.changed();
    return ok(order);
  }

  /**
   * 營業中下緊急叫貨並立即付款（商品金額 + 運費）；明細格式與最低訂購量同一般進貨單。
   * 下單後 2 遊戲小時送達倉庫；打烊前未送達的，改於下一個營業日開店前送達。
   * terms 預設為店長的一般緊急叫貨；狀況可給免運費、不佔每日次數的條件（見 freeRushTerms）。
   */
  placeRushOrder(lines: readonly OrderLine[], terms: RushOrderTerms = STANDARD_RUSH_TERMS): Result<RushOrder> {
    const phase = phaseError(this._phase, 'open');
    if (phase) return fail(phase);
    if (terms.countsTowardDailyLimit && this.rushOrdersLeftToday === 0) return fail('rush-limit-reached');
    if (this.minuteOfDay >= RUSH_LAST_ORDER_MINUTE) return fail('rush-too-late');
    const checked = this.checkOrderLines(lines);
    if (!checked.ok) return checked;
    const nonEmpty = checked.value;
    if (terms.category && nonEmpty.some((l) => productById(l.productId)?.category !== terms.category)) {
      return fail('wrong-category');
    }
    const goods = goodsTotal(nonEmpty);
    const total = goods + terms.shippingFee;
    if (this._funds < total) return fail('insufficient-funds');
    const etaStep = this._step + RUSH_DELIVERY_STEPS;
    const order: RushOrder = {
      lines: nonEmpty,
      placedDay: this._day,
      placedMinute: this.minuteOfDay,
      etaMinute: minuteOfDay(etaStep),
      goods,
      shipping: terms.shippingFee,
      total,
    };
    this.pendingRush = [...this.pendingRush, { order, etaStep }];
    if (terms.countsTowardDailyLimit) this.rushOrdersUsed++;
    this._funds -= total;
    this.ledger.purchases += goods;
    this.ledger.rushShipping += terms.shippingFee;
    this.changed();
    return ok(order);
  }

  /** 進貨明細的共同檢查：略過數量 0 的品項，商品須存在、已解鎖、不低於最低訂購量 */
  private checkOrderLines(lines: readonly OrderLine[]): Result<OrderLine[]> {
    const nonEmpty = lines.filter((l) => l.qty > 0);
    if (nonEmpty.length === 0) return fail('empty-order');
    for (const line of nonEmpty) {
      const product = productById(line.productId);
      if (!product) return fail('unknown-product');
      if (!this.unlocked.has(product.category)) return fail('category-locked');
      if (!Number.isInteger(line.qty) || line.qty < product.minOrder) return fail('below-min-order');
    }
    return ok(nonEmpty);
  }

  /** 營業時段對商品開始限時特價（9／8／7 折），持續 2 遊戲小時後自動恢復售價 */
  startFlashSale(productId: string, tier: number): Result<FlashSale> {
    const phase = phaseError(this._phase, 'open');
    if (phase) return fail(phase);
    const product = productById(productId);
    if (!product) return fail('unknown-product');
    if (!this.unlocked.has(product.category)) return fail('category-locked');
    if (!isFlashSaleTier(tier)) return fail('invalid-discount');
    if (this.flashSaleState.has(productId)) return fail('flash-sale-active');
    if (this.flashSaleState.count >= MAX_FLASH_SALES) return fail('flash-sale-limit');
    const price = flashSalePrice(this.salePrices.get(productId) ?? product.suggestedPrice, tier);
    this.flashSaleState.start(productId, tier, price, this._step);
    this.ledger.flashSaleCategories.add(product.category);
    this.emit({ type: 'flash-sale-started', productId, tier, price });
    this.changed();
    const sale = this.flashSales.find((s) => s.productId === productId) as FlashSale;
    return ok(sale);
  }

  /** 雇用一位店員；日薪於每天打烊時支付 */
  hireStaff(): Result<Staff> {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    if (this._staff.length >= MAX_STAFF) return fail('staff-full');
    const n = this.nextStaffId++;
    const staff: Staff = { id: `s${n}`, name: STAFF_NAMES[(n - 1) % STAFF_NAMES.length] as string };
    this._staff = [...this._staff, staff];
    this.changed();
    return ok(staff);
  }

  fireStaff(id: string): Result {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    if (!this._staff.some((s) => s.id === id)) return fail('unknown-staff');
    this._staff = this._staff.filter((s) => s.id !== id);
    this.changed();
    return ok(undefined);
  }

  /**
   * 派工：標記格位或收銀台優先處理，由最近有空的店員去做。
   * 格位會被補滿（不受補貨門檻限制）；收銀台會有一位店員待命到隊伍清空。完成後標記自動清除。
   */
  dispatch(target: DispatchTarget): Result {
    const phase = phaseError(this._phase, 'open');
    if (phase) return fail(phase);
    const error = this.checkDispatchTarget(target);
    if (error) return fail(error);
    if (this.isDispatched(target)) return fail('already-dispatched');
    if (this._dispatches.length >= MAX_DISPATCHES) return fail('dispatch-full');
    if (target.kind === 'slot') {
      const slot = this.inventory.slot(target.fixtureId, target.slotIndex);
      if (!slot?.productId) return fail('slot-unassigned');
      if (this.slotIsFull(target.fixtureId, target.slotIndex)) return fail('slot-full');
      if (this.inventory.backroomQty(slot.productId) === 0) return fail('no-backroom-stock');
    }
    this._dispatches = [...this._dispatches, target];
    this.changed();
    return ok(undefined);
  }

  /** 取消派工：店員放下尚未取貨的工作，恢復自動工作 */
  cancelDispatch(target: DispatchTarget): Result {
    const phase = phaseError(this._phase, 'open');
    if (phase) return fail(phase);
    if (!this.isDispatched(target)) return fail('not-dispatched');
    this._dispatches = this._dispatches.filter((d) => !sameTarget(d, target));
    if (target.kind === 'slot') {
      for (const agent of this.agents) {
        const t = agent.task;
        if (t && t.fixtureId === target.fixtureId && t.slotIndex === target.slotIndex) {
          agent.cancelDispatch(this.reservedSlots);
        }
      }
    }
    this.changed();
    return ok(undefined);
  }

  private checkDispatchTarget(target: DispatchTarget): CommandError | null {
    if (target.kind === 'register') {
      return this.layout.get(target.registerId)?.kind === 'register' ? null : 'unknown-fixture';
    }
    const fixture = this.layout.get(target.fixtureId);
    if (!fixture || FIXTURES[fixture.kind].slots === 0) return 'invalid-slot';
    return this.inventory.slot(target.fixtureId, target.slotIndex) ? null : 'invalid-slot';
  }

  private slotIsFull(fixtureId: string, slotIndex: number): boolean {
    const fixture = this.layout.get(fixtureId);
    const slot = this.inventory.slot(fixtureId, slotIndex);
    return !!fixture && !!slot && totalQty(slot.batches) >= FIXTURES[fixture.kind].slotCapacity;
  }

  /** 把尚未有人處理的格位派工交給最近有空的店員 */
  private assignSlotDispatches(): void {
    for (const d of this._dispatches) {
      if (d.kind !== 'slot' || this.reservedSlots.has(slotKey(d.fixtureId, d.slotIndex))) continue;
      const task = this.staffWorld
        .restockCandidates()
        .find((c) => c.fixtureId === d.fixtureId && c.slotIndex === d.slotIndex);
      if (!task || task.qty >= task.capacity || task.backroomQty === 0) continue;
      const staff = nearestAvailable(
        this.agents,
        this.staffWorld.slotAccessTile(d.fixtureId, d.slotIndex),
        (s) => !s.onDispatch,
      );
      staff?.assignDispatch(task, this.staffWorld, this.reservedSlots);
    }
  }

  /** 清除已完成（或已無法完成）的派工標記 */
  private clearFinishedDispatches(): void {
    const remaining = this._dispatches.filter((d) => {
      if (d.kind === 'register') return !this.checkout.isStaffedAndClear(d.registerId);
      if (this.slotIsFull(d.fixtureId, d.slotIndex)) return false;
      // 沒有店員在處理、倉庫也沒貨了：無法完成
      const productId = this.inventory.slot(d.fixtureId, d.slotIndex)?.productId;
      const claimed = this.reservedSlots.has(slotKey(d.fixtureId, d.slotIndex));
      return claimed || (!!productId && this.inventory.backroomQty(productId) > 0);
    });
    if (remaining.length === this._dispatches.length) return;
    this._dispatches = remaining;
    this.changed();
  }

  /** 準備階段 → 營業時段：店員從倉庫門出發 */
  openStore(): Result {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    this._phase = 'open';
    this._step = 0;
    this.stepRemainderMs = 0;
    this.agents = this._staff.map((s) => new StaffAgent(s.id, BACKROOM_DOOR));
    this.reservedSlots.clear();
    this._dispatches = [];
    this.customers = [];
    this.pendingRush = [];
    this.rushOrdersUsed = 0;
    this.checkout = new Checkout(this.registerSpots(), (p) => this.layout.isWalkable(p));
    this._pendingIncident = null;
    this.incidentQueue = scheduleIncidents(this.rng, this._day, this.previousIncidentKinds, this.incidentContext());
    this.emit({ type: 'store-opened' });
    this.changed();
    return ok(undefined);
  }

  setSpeed(speed: Speed): void {
    if (this._speed === speed) return;
    this._speed = speed;
    this.changed();
  }

  /** 選擇等待中狀況的選項：立即支付費用並套用效果，遊戲以原本的速度繼續 */
  resolveIncident(option: number): Result<IncidentRecord> {
    const phaseErr = phaseError(this._phase, 'open');
    if (phaseErr) return fail(phaseErr);
    const pending = this._pendingIncident;
    if (!pending) return fail('no-pending-incident');
    const def = incidentDefinition(pending.kind);
    const chosen = def.options[option];
    if (!Number.isInteger(option) || !chosen) return fail('invalid-incident-option');
    if (!canAfford(this._funds, chosen.cost)) return fail('insufficient-funds');
    this._funds -= chosen.cost;
    for (const effect of chosen.effects) this.applyIncidentEffect(effect);
    const record: IncidentRecord = {
      kind: pending.kind,
      name: def.name,
      minute: pending.minute,
      option,
      optionLabel: chosen.label,
      cost: chosen.cost,
    };
    this.ledger.recordIncident(record);
    this._pendingIncident = null;
    this.emit({ type: 'incident-resolved', kind: pending.kind, option });
    this.changed();
    return ok(record);
  }

  private applyIncidentEffect(effect: IncidentEffect): void {
    switch (effect.type) {
      case 'reputation':
        this.ledger.incidentReputation += effect.delta;
        return;
      case 'send-staff-home':
        for (let i = 0; i < effect.count; i++) this.sendStaffHome();
        return;
    }
  }

  /** 一位店員提早下班：手上的貨退回倉庫、放下收銀與補貨工作；今天不再回來 */
  private sendStaffHome(): void {
    const agent = this.agents.at(-1);
    if (!agent) return;
    this.checkout.dismiss(agent);
    this.inventory.receive(agent.leaveWork(this.reservedSlots));
    this.agents = this.agents.slice(0, -1);
  }

  private incidentContext(): IncidentContext {
    return {
      day: this._day,
      funds: this._funds,
      workingStaff: this._phase === 'open' ? this.agents.length : this._staff.length,
      registers: this.layout.list().filter((f) => f.kind === 'register').length,
    };
  }

  /** 到了排定時刻的狀況發生（前提已不成立的略過）；回傳是否有狀況開始等待選擇 */
  private startDueIncident(): boolean {
    while (this.incidentQueue.length > 0 && (this.incidentQueue[0] as ScheduledIncident).minute <= this.minuteOfDay) {
      const next = this.incidentQueue.shift() as ScheduledIncident;
      if (!incidentDefinition(next.kind).precondition(this.incidentContext())) continue;
      this._pendingIncident = next;
      this.stepRemainderMs = 0;
      this.emit({ type: 'incident-started', kind: next.kind });
      this.changed();
      return true;
    }
    return false;
  }

  /** 由畫面迴圈呼叫：依倍速把現實時間換算成固定步數推進；狀況等待選擇時不推進 */
  tick(realDtMs: number): void {
    if (this._phase !== 'open' || this._speed === 0 || this._pendingIncident) return;
    this.stepRemainderMs += realDtMs * this._speed;
    let steps = Math.min(Math.floor(this.stepRemainderMs / STEP_MS), MAX_STEPS_PER_TICK);
    this.stepRemainderMs = Math.min(this.stepRemainderMs - steps * STEP_MS, STEP_MS);
    const minuteBefore = Math.floor(this.minuteOfDay);
    while (steps-- > 0 && this._phase === 'open' && !this._pendingIncident) this.advanceStep();
    if (this._phase === 'open' && Math.floor(this.minuteOfDay) !== minuteBefore) this.changed();
  }

  /** 推進一個固定步長；營業時段結束時打烊 */
  private advanceStep(): void {
    this.maybeSpawnCustomer();
    // 店員工作優先序：有人排隊的收銀台 > 派工標記 > 一般補貨
    const heldRegisters = new Set(this._dispatches.flatMap((d) => (d.kind === 'register' ? [d.registerId] : [])));
    this.checkout.update(
      this.agents,
      this.staffWorld,
      this.reservedSlots,
      this.customerWorld,
      (c) => {
        let amount = 0;
        for (const item of c.basket) {
          this.ledger.recordSale(item.productId, item.price);
          amount += item.price;
        }
        this._funds += amount;
        this.emit({ type: 'sale', amount });
      },
      heldRegisters,
    );
    this.assignSlotDispatches();
    for (const agent of this.agents) agent.update(this.staffWorld, this.reservedSlots);
    if (this._dispatches.length > 0) this.clearFinishedDispatches();
    for (const customer of this.customers) customer.update(this.customerWorld);
    this.removeDepartedCustomers();
    this._step++;
    this.deliverDueRushOrders();
    this.expireFlashSales();
    if (this._step >= STEPS_PER_DAY) this.closeStore();
    else this.startDueIncident();
  }

  /** 送達已到預計時刻的緊急叫貨 */
  private deliverDueRushOrders(): void {
    if (this.pendingRush.length === 0) return;
    const due = this.pendingRush.filter((r) => r.etaStep <= this._step);
    if (due.length === 0) return;
    this.pendingRush = this.pendingRush.filter((r) => r.etaStep > this._step);
    for (const { order } of due) {
      this.deliver(order);
      this.emit({ type: 'rush-delivered', lines: order.lines });
    }
    this.changed();
  }

  /** 到期的限時特價恢復售價並通知 */
  private expireFlashSales(): void {
    const ended = this.flashSaleState.expire(this._step);
    for (const productId of ended) this.emit({ type: 'flash-sale-ended', productId });
    if (ended.length > 0) this.changed();
  }

  /** 營業時段 → 每日結算：支付固定支出並產生結算 */
  private closeStore(): void {
    // 未送達的緊急叫貨轉為一般待送達進貨，下一個營業日開店前送達（ADR 0003）
    this._pendingOrders = [
      ...this._pendingOrders,
      ...this.pendingRush.map(({ order }) => ({ lines: order.lines, placedDay: order.placedDay, total: order.total })),
    ];
    this.pendingRush = [];
    // 還在店內的顧客離開，未結帳的商品退回倉庫
    for (const c of this.customers) c.forceLeave(this.customerWorld);
    this.removeDepartedCustomers();
    // 店員手上還沒上架的商品退回倉庫
    for (const agent of this.agents) this.inventory.receive(agent.carrying);
    this.agents = [];
    this.reservedSlots.clear();
    this._dispatches = [];
    // 打烊時所有限時特價結束，隔天的售價維持原本設定
    this.flashSaleState.clear();
    this.ledger.rent = DAILY_RENT;
    this.ledger.wages = this._staff.length * DAILY_WAGE;
    this._funds -= this.ledger.rent + this.ledger.wages;
    // 狀況效果最晚在打烊時結束
    this.incidentQueue = [];
    this._pendingIncident = null;

    const reputationBefore = this._reputation;
    // 狀況造成的口碑變化與當天的平滑更新一起套用
    this._reputation = clampReputation(
      nextReputation(this._reputation, this.ledger.avgSatisfaction) + this.ledger.incidentReputation,
    );
    this.totalRevenue += this.ledger.revenue;
    this.bestServed = Math.max(this.bestServed, this.ledger.served);
    const milestonesReached = this.checkMilestones();
    this.negativeDays = this._funds < 0 ? this.negativeDays + 1 : 0;
    const bankrupt = this.negativeDays >= BANKRUPTCY_DAYS;

    this._phase = bankrupt ? 'gameover' : 'report';
    this._lastReport = this.ledger.toReport(this._funds, {
      reputationBefore,
      reputationAfter: this._reputation,
      milestonesReached,
      negativeDays: this.negativeDays,
      bankrupt,
    });
    this.emit({ type: 'day-ended', bankrupt });
    for (const id of milestonesReached) this.emit({ type: 'milestone', id });
    this.changed();
  }

  /** 檢查新達成的里程碑並發放解鎖；回傳新達成的 id */
  private checkMilestones(): string[] {
    const ctx = this.milestoneContext;
    const reached: string[] = [];
    for (const m of MILESTONES) {
      if (this.achieved.has(m.id) || m.progress(ctx) < 1) continue;
      this.achieved.add(m.id);
      if (m.unlocks) this.unlocked.add(m.unlocks);
      reached.push(m.id);
    }
    return reached;
  }

  /** 每日結算 → 下一個營業日的準備階段：送達進貨、報廢過期鮮食 */
  startNextDay(): Result {
    if (this._phase !== 'report') return fail('not-report-phase');
    this.previousIncidentKinds = this.ledger.incidents.map((i) => i.kind);
    this._day++;
    this._phase = 'prep';
    this._step = 0;
    this.ledger = new DayLedger(this._day, this._funds);
    for (const order of this._pendingOrders) this.deliver(order);
    this._pendingOrders = [];
    this.ledger.waste = summarizeWaste(this.inventory.removeBatches((b) => isExpired(b, this._day)));
    this.changed();
    return ok(undefined);
  }

  private deliver(order: { readonly lines: readonly OrderLine[] }): void {
    this.inventory.receive(order.lines.map((l) => ({ productId: l.productId, qty: l.qty, arrivedDay: this._day })));
  }

  /** 今天開始時報廢的商品 */
  get todayWaste(): readonly WasteLine[] {
    return this.ledger.waste;
  }

  private maybeSpawnCustomer(): void {
    const minute = this.minuteOfDay;
    if (!this.customerArrivals) return;
    if (minute >= CLOSE_MINUTE - LAST_ENTRY_BEFORE_CLOSE || this.customers.length >= MAX_CUSTOMERS_IN_STORE) return;
    const perStep = (arrivalsPerHour(minute) * arrivalMultiplier(this._reputation) * MINUTES_PER_STEP) / 60;
    if (!this.rng.chance(perStep)) return;
    const list = rollShoppingList(this.rng, [...this.unlocked]);
    const patience = this.rng.int(...PATIENCE_RANGE);
    this.customers.push(new CustomerAgent(`c${this.nextCustomerId++}`, list, patience, this.customerWorld));
    this.ledger.entered++;
  }

  private removeDepartedCustomers(): void {
    this.customers = this.customers.filter((c) => {
      if (c.activity !== 'gone') return true;
      if (c.outcome) this.ledger.recordCustomer(c.outcome, c.satisfaction, c.stockoutCategories);
      return false;
    });
  }

  private registerSpots(): RegisterSpot[] {
    return this.layout
      .list()
      .filter((f) => f.kind === 'register')
      .map((f) => ({
        id: f.id,
        customerTile: customerAccessTiles(FIXTURES.register, f)[0] as GridPoint,
        staffTile: staffAccessTiles(FIXTURES.register, f)[0] as GridPoint,
        queueDir: FACING_DIR[f.facing],
      }));
  }

  private createCustomerWorld(): CustomerWorld {
    return {
    entrance: ENTRANCE,
    isWalkable: (p) => this.layout.isWalkable(p),
    rng: this.rng,
    offersFor: (category) =>
      this.layout.list().flatMap((f) =>
        this.inventory.slots(f.id).flatMap((slot, slotIndex) => {
          const product = slot.productId ? productById(slot.productId) : undefined;
          if (!product || product.category !== category || totalQty(slot.batches) === 0) return [];
          return [{ fixtureId: f.id, slotIndex, accessTile: slotAccessTile(FIXTURES[f.kind], f, slotIndex) }];
        }),
      ),
    carries: (category) =>
      this.layout
        .list()
        .some((f) =>
          this.inventory.slots(f.id).some((slot) => slot.productId && productById(slot.productId)?.category === category),
        ),
    slotContent: (fixtureId, slotIndex) => {
      const slot = this.inventory.slot(fixtureId, slotIndex);
      return slot?.productId ? { productId: slot.productId, qty: totalQty(slot.batches) } : null;
    },
    pricing: (productId) => ({
      salePrice: this.currentPrice(productId) ?? 0,
      suggestedPrice: productById(productId)?.suggestedPrice ?? 1,
    }),
    takeOne: (fixtureId, slotIndex) => this.inventory.takeFromSlot(fixtureId, slotIndex, 1),
    returnToBackroom: (batches) => this.inventory.receive(batches),
    joinQueue: (c) => this.checkout.join(c),
    leaveQueue: (c) => {
      this.checkout.leave(c);
      this.emit({ type: 'abandon' });
    },
    queueTile: (c) => this.checkout.queueTile(c),
  };
  }

  private readonly staffWorld: StaffWorld = {
    backroomDoor: BACKROOM_DOOR,
    isWalkable: (p) => this.layout.isWalkable(p),
    restockCandidates: () =>
      this.layout.list().flatMap((f) => {
        const capacity = FIXTURES[f.kind].slotCapacity;
        return this.inventory.slots(f.id).flatMap((slot, slotIndex) =>
          slot.productId
            ? [
                {
                  fixtureId: f.id,
                  slotIndex,
                  productId: slot.productId,
                  qty: totalQty(slot.batches),
                  capacity,
                  backroomQty: this.inventory.backroomQty(slot.productId),
                },
              ]
            : [],
        );
      }),
    slotAccessTile: (fixtureId, slotIndex) => {
      const f = this.layout.get(fixtureId);
      if (!f) return BACKROOM_DOOR;
      return slotAccessTile(FIXTURES[f.kind], f, slotIndex);
    },
    takeFromBackroom: (productId, qty) => this.inventory.takeFromBackroom(productId, qty),
    putIntoSlot: (fixtureId, slotIndex, batches) => {
      const f = this.layout.get(fixtureId);
      if (!f) return this.inventory.receive(batches);
      this.inventory.putIntoSlot(fixtureId, slotIndex, batches, FIXTURES[f.kind].slotCapacity);
    },
  };

  /** 直接從倉庫補滿格位（略過店員）；回傳補上的數量。供測試布置情境用 */
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

const clampReputation = (r: number) => Math.min(100, Math.max(0, r));

function summarizeWaste(batches: readonly { productId: string; qty: number }[]): WasteLine[] {
  const qty = new Map<string, number>();
  for (const b of batches) qty.set(b.productId, (qty.get(b.productId) ?? 0) + b.qty);
  return [...qty].map(([productId, q]) => ({ productId, qty: q, cost: q * (productById(productId)?.cost ?? 0) }));
}

/** 第 1 天準備階段下的進貨單是開幕進貨，當天立即送達 */
export function isOpeningDelivery(day: number): boolean {
  return day === 1;
}

export function sellRefund(kind: FixtureKind): number {
  return Math.floor(FIXTURES[kind].price * SELL_REFUND_RATE);
}
