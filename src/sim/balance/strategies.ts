import { WEATHER_DEMAND, conditionsArrivalMultiplier, listShare } from '../agents/demand';
import { CATEGORIES, CATEGORY_IDS, PRODUCTS, productById } from '../catalog/products';
import type { CategoryId } from '../catalog/products';
import type { FixtureKind } from '../catalog/fixtures';
import { SHIPPING_FEE } from '../economy/purchase-order';
import { DAILY_RENT, DAILY_WAGE, Game } from '../game';
import type { PendingIncident } from '../incidents/incidents';
import { totalQty } from '../inventory/batch';
import type { Facing } from '../store/geometry';
import { runOpenHours } from '../test-helpers';
import type { DayConditions } from '../weather/weather';

/** 無畫面平衡測試用的「店長策略」：每天準備階段替玩家做決策 */
export interface Strategy {
  readonly name: string;
  /** 第 1 天準備階段 */
  setup(game: Game, plan: StorePlan): void;
  /** 每天準備階段（含第 1 天，在 setup 之後） */
  prep(game: Game, plan: StorePlan): void;
  /** 遇到狀況時選哪個選項（回傳索引）；選到付不起的選項時改選第一個付得起的 */
  chooseIncidentOption(incident: PendingIncident, game: Game): number;
}

/** 第一個選項 */
export const firstOption = (): number => 0;

/** 最便宜的選項（同價取後面的：都不花錢時，後面的是「不處理」） */
export function cheapestOption(incident: PendingIncident): number {
  return incident.options.reduce((best, o, i, all) => (o.cost <= (all[best] as typeof o).cost ? i : best), 0);
}

/** 最花錢的選項（同價取後面的） */
export function costliestOption(incident: PendingIncident): number {
  return incident.options.reduce((best, o, i, all) => (o.cost >= (all[best] as typeof o).cost ? i : best), 0);
}

/** 策略記住的店面配置：陳列櫃 id 與預計放的商品 */
export interface StorePlan {
  readonly displays: { id: string; products: (string | null)[] }[];
  /** 已經依解鎖補上陳列的類別 */
  readonly stocked: Set<CategoryId>;
  /** 上一次準備階段時「今天」的天氣與星期（依預報進貨用來換算昨天的銷量） */
  lastConditions?: DayConditions;
}

export interface DayRow {
  readonly day: number;
  readonly revenue: number;
  readonly net: number;
  readonly funds: number;
  readonly reputation: number;
  readonly entered: number;
  readonly served: number;
  readonly leftEmpty: number;
  readonly abandoned: number;
  readonly staff: number;
  /** 當天狀況支出 */
  readonly incidentCosts: number;
  readonly milestones: readonly string[];
  readonly bankrupt: boolean;
}

export function place(game: Game, kind: FixtureKind, x: number, y: number, facing: Facing): string {
  const r = game.placeFixture(kind, { origin: { x, y }, facing });
  if (!r.ok) throw new Error(`place ${kind} at (${x},${y}) ${facing}: ${r.error}`);
  return r.value.id;
}

function addDisplay(game: Game, plan: StorePlan, kind: FixtureKind, x: number, y: number, facing: Facing, products: (string | null)[]) {
  const id = place(game, kind, x, y, facing);
  products.forEach((p, i) => p && game.assignSlot(id, i, p));
  plan.displays.push({ id, products });
}

/** 沒有銷售紀錄時，每個商品預估的日銷量 */
const DEFAULT_DAILY_SALES = 15;

/**
 * 依昨天賣量預估日需求。今天下的單明天才到，
 * 所以要讓「現有 + 在途 − 今天會賣掉」≥ 明天需求 × cover。
 * tomorrowFactor 為各類別明天需求相對於昨天賣量的倍率（依預報進貨用）；省略時視為與昨天相同。
 * 資金不夠時按比例縮減。
 */
export function parOrder(
  game: Game,
  plan: StorePlan,
  cover = 1.2,
  tomorrowFactor?: (category: CategoryId) => number,
): void {
  const sold = game.lastReport?.sales ?? {};
  const onShelf = new Map<string, number>();
  for (const d of plan.displays) {
    for (const slot of game.slots(d.id)) {
      if (slot.productId) onShelf.set(slot.productId, (onShelf.get(slot.productId) ?? 0) + totalQty(slot.batches));
    }
  }
  const products = new Set(plan.displays.flatMap((d) => d.products).filter((p): p is string => !!p));
  const wants: { productId: string; need: number; minOrder: number; cost: number }[] = [];
  for (const productId of products) {
    const product = productById(productId);
    if (!product || !game.isUnlocked(product.category)) continue;
    const expected = sold[productId] ?? DEFAULT_DAILY_SALES;
    // 今天照昨天的賣量，明天再乘上 tomorrowFactor
    const days = 1 + cover * (tomorrowFactor?.(product.category) ?? 1);
    const have =
      game.backroomQty(productId) +
      (onShelf.get(productId) ?? 0) +
      game.pendingOrders.flatMap((o) => o.lines).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);
    const need = Math.ceil(expected * days - have);
    if (need > 0) wants.push({ productId, need, minOrder: product.minOrder, cost: product.cost });
  }
  // 保留一天的租金與日薪，避免付不出來
  const reserve = DAILY_RENT + game.staff.length * DAILY_WAGE;
  const budget = game.funds - reserve - SHIPPING_FEE;
  const fullCost = wants.reduce((s, w) => s + w.need * w.cost, 0);
  const scale = fullCost > 0 ? Math.min(1, Math.max(0, budget) / fullCost) : 0;
  const lines = wants
    .map((w) => ({ productId: w.productId, qty: Math.floor((w.need * scale) / w.minOrder) * w.minOrder }))
    .map((l, i) => ({ ...l, qty: l.qty === 0 && scale >= 0.99 ? wants[i]!.minOrder : l.qty }))
    .filter((l) => l.qty > 0);
  if (lines.length > 0) {
    const r = game.submitPurchaseOrder(lines);
    if (!r.ok && r.error !== 'insufficient-funds') throw new Error(r.error);
  }
}

/** 一般玩家：2 冷藏櫃 + 2 貨架 + 1 收銀台 + 2 店員，依銷量補貨，解鎖後擴充品項，賺錢後加開收銀台 */
export const standard: Strategy = {
  name: '標準經營',
  setup(game, plan) {
    addDisplay(game, plan, 'fridge', 3, 0, 'south', ['cola', 'green-tea', 'water', 'cola']);
    addDisplay(game, plan, 'fridge', 6, 0, 'south', [null, null, null, null]);
    addDisplay(game, plan, 'shelf', 10, 3, 'west', ['chips', 'chips', 'chocolate', 'chocolate']);
    addDisplay(game, plan, 'shelf', 3, 4, 'south', ['cup-noodle', 'cup-noodle', 'bowl-noodle', 'bowl-noodle']);
    place(game, 'register', 7, 7, 'west');
    game.hireStaff();
    game.hireStaff();
    plan.stocked.add('drink').add('snack').add('noodle');
  },
  prep(game, plan) {
    standardPrep(game, plan);
  },
  chooseIncidentOption: firstOption,
};

/** 標準經營的準備階段：依解鎖擴充品項、賺錢後加開收銀台，再依銷量補貨 */
function standardPrep(game: Game, plan: StorePlan, tomorrowFactor?: (category: CategoryId) => number): void {
  if (game.isUnlocked('fresh') && !plan.stocked.has('fresh')) {
    const fridge = plan.displays[1]!;
    fridge.products.splice(0, 4, 'rice-ball', 'sandwich', 'bento', 'rice-ball');
    fridge.products.forEach((p, i) => game.assignSlot(fridge.id, i, p));
    plan.stocked.add('fresh');
  }
  if (game.isUnlocked('daily') && !plan.stocked.has('daily') && game.funds > 6_000) {
    addDisplay(game, plan, 'shelf', 3, 7, 'north', ['tissue', 'tissue', 'toothbrush', 'toothbrush']);
    plan.stocked.add('daily');
  }
  const r = game.lastReport;
  if (r && game.staff.length < 3 && r.customers.abandoned > 4 && game.funds > 18_000) {
    place(game, 'register', 7, 4, 'west');
    game.hireStaff();
  }
  parOrder(game, plan, undefined, tomorrowFactor);
}

/**
 * 某天某類別的預期需求倍率（相對晴天平日）：天氣與星期的來客倍率 ×
 * 天氣的類別需求倍率讓該類別出現在購物清單的機率變化。
 */
export function expectedDemandFactor(
  conditions: Pick<DayConditions, 'weather' | 'weekend'>,
  category: CategoryId,
  available: readonly CategoryId[],
): number {
  const base = listShare(available)[category] ?? 0;
  if (base === 0) return 1;
  const shifted = listShare(available, WEATHER_DEMAND[conditions.weather])[category] ?? 0;
  return (conditionsArrivalMultiplier(conditions) * shifted) / base;
}

/**
 * 依預報進貨的需求調整：明天相對於昨天（賣量的來源）的預期需求倍率。
 * 鮮食會報廢，照倍率增減（雨天前少進）；其他類別放得住，只在明天需求較高時多進（熱天前多進飲料、冷天前多進泡麵），
 * 需求較低時照標準進貨，不冒缺貨的風險。
 */
export function forecastAdjustment(game: Game, yesterday: DayConditions | undefined): (category: CategoryId) => number {
  const available = CATEGORY_IDS.filter((c) => game.isUnlocked(c));
  const factor = (c: DayConditions | undefined, category: CategoryId) =>
    c ? expectedDemandFactor(c, category, available) : 1;
  return (category) => {
    const relative = factor(game.forecast, category) / factor(yesterday, category);
    return CATEGORIES[category].shelfLife !== undefined ? relative : Math.max(1, relative);
  };
}

/** 依預報進貨：標準經營的店，各類別的進貨量依明日預報的天氣與星期調整（見 forecastAdjustment） */
export const forecastAware: Strategy = {
  ...standard,
  name: '依預報進貨',
  prep(game, plan) {
    const yesterday = plan.lastConditions;
    plan.lastConditions = game.today;
    standardPrep(game, plan, forecastAdjustment(game, yesterday));
  },
};

/** 偷懶：只開一個貨架、一位店員，固定少量進貨 */
export const minimal: Strategy = {
  name: '最低限度',
  setup(game, plan) {
    addDisplay(game, plan, 'fridge', 3, 0, 'south', ['cola', 'green-tea', 'water', 'cola']);
    place(game, 'register', 7, 7, 'west');
    game.hireStaff();
    plan.stocked.add('drink');
  },
  prep(game, plan) {
    parOrder(game, plan);
  },
  chooseIncidentOption: cheapestOption,
};

/** 揮霍：雇滿店員、高價販售 */
export const overspend: Strategy = {
  name: '揮霍高價',
  setup(game, plan) {
    standard.setup(game, plan);
    while (game.hireStaff().ok);
    for (const p of PRODUCTS) game.setSalePrice(p.id, Math.round(p.suggestedPrice * 1.4));
  },
  prep(game, plan) {
    parOrder(game, plan);
  },
  chooseIncidentOption: costliestOption,
};

/**
 * 最差應對（守門測試用）：標準經營的店，但狀況一律選最花錢的選項（都不花錢時選「不處理」），
 * 付不起時才選不花錢、帶負面效果的那個。
 */
export const worstResponse: Strategy = {
  ...standard,
  name: '最差應對',
  chooseIncidentOption: costliestOption,
};

/** 標準經營的店，狀況一律選不花錢、不處理的選項（口碑扣分、少一位店員、團客不派工、不叫貨、不買出清） */
export const neglectResponse: Strategy = {
  ...standard,
  name: '一律不處理',
  chooseIncidentOption: cheapestOption,
};

export const STRATEGIES: readonly Strategy[] = [
  standard,
  forecastAware,
  minimal,
  overspend,
  worstResponse,
  neglectResponse,
];

/** 以策略經營 days 天（遇破產提前結束），回傳每天的結果 */
export function simulate(strategy: Strategy, days: number, seed: number): DayRow[] {
  const game = new Game({ seed });
  const plan: StorePlan = { displays: [], stocked: new Set() };
  strategy.setup(game, plan);
  const rows: DayRow[] = [];
  for (let d = 0; d < days; d++) {
    strategy.prep(game, plan);
    // 準備階段把格位補滿，相當於開店前店員已上架
    runOpenHours(game, (incident) => {
      const choice = strategy.chooseIncidentOption(incident, game);
      return incident.options[choice]?.available ? choice : incident.options.findIndex((o) => o.available);
    });
    const r = game.lastReport!;
    rows.push({
      day: r.day,
      revenue: r.revenue,
      net: r.fundsAtEnd - r.fundsAtStart,
      funds: r.fundsAtEnd,
      reputation: Math.round(r.progress.reputationAfter),
      entered: r.customers.entered,
      served: r.customers.served,
      leftEmpty: r.customers.leftEmpty,
      abandoned: r.customers.abandoned,
      staff: game.staff.length,
      incidentCosts: r.incidentCosts,
      milestones: r.progress.milestonesReached,
      bankrupt: r.progress.bankrupt,
    });
    if (r.progress.bankrupt) break;
    game.startNextDay();
  }
  return rows;
}
