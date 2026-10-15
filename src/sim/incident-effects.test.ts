import { describe, expect, it } from 'vitest';
import { WEATHER_DEMAND, arrivalsPerHour, conditionsArrivalMultiplier } from './agents/demand';
import { productById } from './catalog/products';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { freeRushTerms } from './economy/rush-order';
import { Game } from './game';
import { GROUP_VISIT_MINUTES } from './incidents/incidents';
import type { IncidentKind, IncidentRecord, PendingIncident } from './incidents/incidents';
import { arrivalMultiplier } from './progress/progress';
import { runOpenHours } from './test-helpers';

type Chooser = (incident: PendingIncident) => number;

/** 不花錢的選項 */
const free: Chooser = (i) => i.options.findIndex((o) => o.cost === 0);
const first: Chooser = () => 0;

interface StoreOptions {
  seed?: number;
  staff?: number;
  /** 收銀台數量 */
  registers?: number;
  /** 冷藏櫃 4 個格位的商品 */
  fridge?: readonly string[];
  /** 貨架 4 個格位的商品；null 為不放貨架 */
  shelf?: readonly string[] | null;
  customers?: boolean;
}

const REGISTER_SPOTS = [
  { x: 5, y: 7 },
  { x: 5, y: 4 },
  { x: 8, y: 7 },
];

/** 冷藏櫃 + 貨架 + 收銀台的店；陳列的商品各進一批 */
function store({
  seed = 1,
  staff = 2,
  registers = 1,
  fridge = ['cola', 'water', 'cola', 'water'],
  shelf = ['chips', 'chips', 'chips', 'chips'],
  customers = true,
}: StoreOptions = {}) {
  const game = new Game({ nuisances: false, seed, customerArrivals: customers });
  const f = game.placeFixture('fridge', { origin: { x: 1, y: 0 }, facing: 'south' });
  if (!f.ok) throw new Error(f.error);
  fridge.forEach((p, i) => game.assignSlot(f.value.id, i, p));
  if (shelf) {
    const s = game.placeFixture('shelf', { origin: { x: 10, y: 3 }, facing: 'west' });
    if (!s.ok) throw new Error(s.error);
    shelf.forEach((p, i) => game.assignSlot(s.value.id, i, p));
  }
  const registerIds = REGISTER_SPOTS.slice(0, registers).map((origin) => {
    const r = game.placeFixture('register', { origin, facing: 'west' });
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  });
  const products = [...new Set([...fridge, ...(shelf ?? [])])];
  game.submitPurchaseOrder(products.map((productId) => ({ productId, qty: 120 })));
  for (let i = 0; i < staff; i++) game.hireStaff();
  return { game, registerIds };
}

/** 準備階段：陳列的商品倉庫不到 60 個就補進一批，店不會賣光也不會破產 */
function restock(game: Game) {
  const products = new Set(game.fixtures.flatMap((f) => game.slots(f.id).map((s) => s.productId)));
  const lines = [...products]
    .filter((id): id is string => !!id && game.backroomQty(id) < 60)
    .map((productId) => ({ productId, qty: 36 }));
  if (lines.length > 0 && game.day > 1) game.submitPurchaseOrder(lines);
}

/** 跑完一個營業日並進入下一天；回傳當天處理的狀況 */
function playDay(game: Game, choose: Chooser = free): readonly IncidentRecord[] {
  restock(game);
  runOpenHours(game, choose);
  const incidents = game.lastReport!.incidents;
  game.startNextDay();
  return incidents;
}

/** 逐步推進營業時段，直到有狀況等待選擇或打烊 */
function tickUntilIncidentOrClose(game: Game) {
  while (game.phase === 'open' && !game.pendingIncident) game.tick(STEP_MS * MAX_STEPS_PER_TICK);
}

/** 一天天經營，直到某種狀況發生並停在等待選擇；其他狀況以 choose 處理 */
function playUntil(game: Game, kind: IncidentKind, choose: Chooser = free): PendingIncident {
  for (let d = 0; d < 40; d++) {
    if (game.phase === 'prep') {
      restock(game);
      game.openStore();
    }
    for (;;) {
      tickUntilIncidentOrClose(game);
      const pending = game.pendingIncident;
      if (!pending) break;
      if (pending.kind === kind) return pending;
      game.resolveIncident(choose(pending));
    }
    game.startNextDay();
  }
  throw new Error(`40 天內沒有發生 ${kind}`);
}

/** 一次推進一步；途中發生的其他狀況以 free 處理 */
function stepOnce(game: Game) {
  const pending = game.pendingIncident;
  if (pending) game.resolveIncident(free(pending));
  game.tick(STEP_MS / game.speed);
}

/** 把當天剩下的營業時段跑完 */
function finishDay(game: Game, choose: Chooser = free) {
  for (;;) {
    tickUntilIncidentOrClose(game);
    if (!game.pendingIncident) return;
    game.resolveIncident(choose(game.pendingIncident));
  }
}

/** 連續經營 days 天，收集發生過的狀況 */
function kindsOver(game: Game, days: number): IncidentKind[] {
  return Array.from({ length: days }, () => playDay(game).map((i) => i.kind)).flat();
}

/** 沒有狀況時的來客速率：時段曲線 × 口碑倍率 × 今天的天氣與星期倍率 */
const baseRate = (game: Game) =>
  arrivalsPerHour(game.minuteOfDay, game.today.weekend) *
  arrivalMultiplier(game.reputation) *
  conditionsArrivalMultiplier(game.today);

describe('團客來店', () => {
  it('店內沒有收銀台時不會發生', () => {
    // 沒有收銀台就沒有營收：不雇店員，撐得過 15 天
    const { game } = store({ registers: 0, staff: 0, seed: 4 });
    const kinds = kindsOver(game, 15);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).not.toContain('group-visit');
  });

  it.each([0, 1])('選項 %i：接下來 30 遊戲分鐘來客速率為平常的 3 倍，之後恢復', (option) => {
    const { game } = store();
    playUntil(game, 'group-visit');
    expect(game.arrivalsPerHourNow).toBeCloseTo(baseRate(game));
    const start = game.minuteOfDay;
    game.resolveIncident(option);
    while (game.minuteOfDay < start + GROUP_VISIT_MINUTES - 1) {
      expect(game.arrivalsPerHourNow).toBeCloseTo(baseRate(game) * 3);
      stepOnce(game);
    }
    while (game.minuteOfDay < start + GROUP_VISIT_MINUTES + 1) stepOnce(game);
    expect(game.arrivalsPerHourNow).toBeCloseTo(baseRate(game));
  });

  it('期間進店的顧客明顯比平常多', () => {
    // 幾個種子合計：團客的 30 分鐘內進店人數 vs. 平常速率的預期人數
    let entered = 0;
    let expectedNormal = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const { game } = store({ seed });
      playUntil(game, 'group-visit');
      const start = game.minuteOfDay;
      expectedNormal += (baseRate(game) * GROUP_VISIT_MINUTES) / 60;
      // 以帳上的進店人數計：一進店就因缺貨或沒賣而離開的顧客也算
      const before = game.todayEntered;
      game.resolveIncident(0);
      while (game.minuteOfDay < start + GROUP_VISIT_MINUTES) stepOnce(game);
      entered += game.todayEntered - before;
    }
    expect(entered).toBeGreaterThan(expectedNormal * 2);
  });

  it('「派工到收銀台」：對人最多的收銀台派工，店員在團客期間守在收銀台，之後標記清除', () => {
    const { game, registerIds } = store({ registers: 2, staff: 2 });
    playUntil(game, 'group-visit');
    const queues = registerIds.map((id) => game.queueLength(id));
    const busiest = registerIds[queues.indexOf(Math.max(...queues))]!;
    const start = game.minuteOfDay;
    game.resolveIncident(0);
    const target = { kind: 'register', registerId: busiest } as const;
    expect(game.dispatches).toContainEqual(target);
    // 走到收銀台後一直待命到團客結束（即使隊伍暫時清空）
    while (!game.staffAgents.some((a) => a.registerId === busiest && a.activity === 'cashier')) stepOnce(game);
    while (game.minuteOfDay < start + GROUP_VISIT_MINUTES - 1) {
      expect(game.isDispatched(target)).toBe(true);
      expect(game.staffAgents.some((a) => a.registerId === busiest)).toBe(true);
      stepOnce(game);
    }
    // 團客結束、隊伍清空後恢復自動工作
    while (game.phase === 'open' && game.isDispatched(target)) stepOnce(game);
    expect(game.phase).toBe('open');
    expect(game.minuteOfDay).toBeGreaterThanOrEqual(start + GROUP_VISIT_MINUTES);
  });

  it('派工標記已有 2 個時仍會加上，不會擠掉店長自己的標記', () => {
    // 沒有店員：收銀台派工不會完成，標記一直留著
    const { game, registerIds } = store({ registers: 3, staff: 0 });
    playUntil(game, 'group-visit');
    const [a, b, c] = registerIds as [string, string, string];
    expect(game.dispatch({ kind: 'register', registerId: a }).ok).toBe(true);
    expect(game.dispatch({ kind: 'register', registerId: b }).ok).toBe(true);
    game.resolveIncident(0);
    expect(game.dispatches).toEqual([
      { kind: 'register', registerId: a },
      { kind: 'register', registerId: b },
      { kind: 'register', registerId: c },
    ]);
  });

  it('「不處理」：不派工、不花錢', () => {
    const { game } = store();
    const pending = playUntil(game, 'group-visit');
    expect(pending.options.map((o) => o.cost)).toEqual([0, 0]);
    const funds = game.funds;
    game.resolveIncident(1);
    expect(game.dispatches).toEqual([]);
    expect(game.funds).toBe(funds);
  });

  it('效果在打烊時結束：隔天來客速率恢復', () => {
    const { game } = store();
    playUntil(game, 'group-visit');
    game.resolveIncident(1);
    finishDay(game);
    expect(game.lastReport!.incidents.map((i) => i.kind)).toContain('group-visit');
    game.startNextDay();
    game.openStore();
    expect(game.arrivalsPerHourNow).toBeCloseTo(baseRate(game));
  });
});

describe('熱浪', () => {
  it('店裡沒有陳列飲料時不會發生', () => {
    const { game } = store({ fridge: [], seed: 6 });
    const kinds = kindsOver(game, 15);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).not.toContain('heat-wave');
  });

  it('免運費叫貨的明細為每種陳列飲料各訂最低訂購量，費用為商品金額', () => {
    const { game } = store();
    const pending = playUntil(game, 'heat-wave');
    expect(pending.params.lines).toEqual([
      { productId: 'cola', qty: 12 },
      { productId: 'water', qty: 12 },
    ]);
    const goods = 12 * productById('cola')!.cost + 12 * productById('water')!.cost;
    expect(pending.options[0]).toMatchObject({ cost: goods, available: true });
    expect(pending.options[1]).toMatchObject({ cost: 0, available: true });
  });

  it.each([0, 1])('選項 %i：當天飲料需求加倍（與天氣的倍率相乘）；隔天恢復', (option) => {
    const { game } = store();
    playUntil(game, 'heat-wave');
    const weatherDrink = WEATHER_DEMAND[game.today.weather].drink ?? 1;
    expect(game.demandMultiplier('drink')).toBe(weatherDrink);
    game.resolveIncident(option);
    expect(game.demandMultiplier('drink')).toBeCloseTo(weatherDrink * 2);
    expect(game.demandMultiplier('snack')).toBe(1);
    finishDay(game);
    game.startNextDay();
    game.openStore();
    expect(game.demandMultiplier('drink')).toBe(WEATHER_DEMAND[game.today.weather].drink ?? 1);
  });

  it('「免運費叫飲料」：只扣商品金額、不扣運費、不佔每日次數，2 小時後送達倉庫', () => {
    // 沒有顧客也沒有店員：倉庫數量只會因進貨改變
    const { game } = store({ customers: false, staff: 0 });
    const pending = playUntil(game, 'heat-wave');
    const goods = pending.options[0]!.cost;
    const funds = game.funds;
    const colaBefore = game.backroomQty('cola');
    const waterBefore = game.backroomQty('water');
    game.resolveIncident(0);
    expect(game.funds).toBe(funds - goods);
    expect(game.rushOrdersLeftToday).toBe(1);
    expect(game.rushOrders).toHaveLength(1);
    expect(game.rushOrders[0]).toMatchObject({ shipping: 0, goods, total: goods });
    const eta = game.rushOrders[0]!.etaMinute;
    // 店長自己的緊急叫貨仍可下
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }]).ok).toBe(true);
    while (game.phase === 'open' && game.minuteOfDay < eta - 1) stepOnce(game);
    expect(game.backroomQty('cola')).toBe(colaBefore);
    while (game.phase === 'open' && game.minuteOfDay < eta + 1) stepOnce(game);
    expect(game.rushOrders.some((o) => o.shipping === 0)).toBe(false);
    expect(game.backroomQty('cola')).toBe(colaBefore + 12);
    expect(game.backroomQty('water')).toBe(waterBefore + 12);
    finishDay(game);
    const r = game.lastReport!;
    expect(r.rushShipping).toBe(2 * 300);
    const record = r.incidents.find((i) => i.kind === 'heat-wave')!;
    // 商品金額計入進貨成本，不算狀況支出
    expect(record).toMatchObject({ cost: 0, goods });
  });

  it('免運費條件只限飲料：非飲料商品被拒', () => {
    const { game } = store();
    playUntil(game, 'heat-wave');
    game.resolveIncident(1);
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }], freeRushTerms('drink'))).toEqual({
      ok: false,
      error: 'wrong-category',
    });
  });

  it('付不起商品金額時不能選叫貨，只能選不處理', () => {
    // 只有一個放可樂的冷藏櫃、沒有收銀台與店員：第 1 天付完租金後只剩 $100，買不起 12 瓶可樂
    const game = new Game({ nuisances: false, seed: 2, startingFunds: 4_700 });
    const f = game.placeFixture('fridge', { origin: { x: 1, y: 0 }, facing: 'south' });
    if (!f.ok) throw new Error(f.error);
    game.assignSlot(f.value.id, 0, 'cola');
    const pending = playUntil(game, 'heat-wave');
    expect(game.funds).toBeLessThan(pending.options[0]!.cost);
    expect(pending.options.map((o) => o.available)).toEqual([false, true]);
    expect(game.resolveIncident(0)).toEqual({ ok: false, error: 'insufficient-funds' });
    expect(game.rushOrders).toHaveLength(0);
    const weatherDrink = WEATHER_DEMAND[game.today.weather].drink ?? 1;
    expect(game.demandMultiplier('drink')).toBe(weatherDrink);
    expect(game.resolveIncident(1).ok).toBe(true);
    expect(game.demandMultiplier('drink')).toBeCloseTo(weatherDrink * 2);
  });
});

describe('供應商出清', () => {
  it('只挑已解鎖且店裡有陳列的商品', () => {
    // 杯麵已解鎖但沒陳列；鮮食沒解鎖
    const { game } = store({ seed: 3 });
    const picked = new Set<string>();
    for (let d = 0; d < 30; d++) {
      playDay(game, (i) => {
        if (i.kind === 'supplier-clearance') picked.add(i.params.productId!);
        return free(i);
      });
    }
    expect(picked.size).toBeGreaterThan(1);
    for (const id of picked) expect(['cola', 'water', 'chips']).toContain(id);
  });

  it('店裡沒有陳列任何商品時不會發生', () => {
    const { game } = store({ fridge: [], shelf: null, seed: 8 });
    const kinds = kindsOver(game, 15);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).not.toContain('supplier-clearance');
  });

  it('「買下」：立即扣款、倉庫立即增加，成本為 7 折進價，計入進貨成本', () => {
    const { game } = store();
    const pending = playUntil(game, 'supplier-clearance');
    const product = productById(pending.params.productId!)!;
    const qty = product.minOrder * 2;
    const goods = Math.round(qty * product.cost * 0.7);
    expect(pending.description).toContain(product.name);
    expect(pending.options[0]).toMatchObject({ cost: goods, available: true });
    expect(pending.options[0]!.label).toContain(product.name);
    const funds = game.funds;
    const backroom = game.backroomQty(product.id);
    game.resolveIncident(0);
    expect(game.funds).toBe(funds - goods);
    expect(game.backroomQty(product.id)).toBe(backroom + qty);
    finishDay(game);
    const record = game.lastReport!.incidents.find((i) => i.kind === 'supplier-clearance')!;
    expect(record).toMatchObject({ cost: 0, goods, params: { productId: product.id } });
  });

  it('「拒絕」：資金與倉庫都不變', () => {
    const { game } = store();
    const pending = playUntil(game, 'supplier-clearance');
    const funds = game.funds;
    const backroom = game.backroomQty(pending.params.productId!);
    game.resolveIncident(1);
    expect(game.funds).toBe(funds);
    expect(game.backroomQty(pending.params.productId!)).toBe(backroom);
  });
});

describe('每日結算與重現性', () => {
  it('收支對得起來：進貨成本含狀況的進貨，狀況支出只含其他費用', () => {
    const { game } = store({ seed: 3 });
    for (let d = 1; d <= 12; d++) {
      runOpenHours(game, first);
      const r = game.lastReport!;
      expect(r.incidentCosts).toBe(r.incidents.reduce((s, i) => s + i.cost, 0));
      expect(r.fundsAtEnd - r.fundsAtStart).toBe(
        r.revenue + r.goalFunds - r.purchases - r.rushShipping - r.fixtures - r.rent - r.wages - r.incidentCosts,
      );
      game.startNextDay();
    }
  });

  it('同種子、同選擇下，狀況的種類、時刻、參數與結果完全相同', () => {
    const run = () => {
      const { game } = store({ seed: 11 });
      const days = Array.from({ length: 12 }, (_, d) => {
        playDay(game, d % 2 === 0 ? first : free);
        return game.lastReport;
      });
      return { days, funds: game.funds, reputation: game.reputation };
    };
    const a = run();
    const kinds = new Set(a.days.flatMap((r) => r!.incidents.map((i) => i.kind)));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    expect(run()).toEqual(a);
  });
});
