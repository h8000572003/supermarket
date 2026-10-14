import { CATEGORIES } from '../catalog/products';
import type { CategoryId } from '../catalog/products';
import type { Rng } from '../rng';
import type { DayConditions } from '../weather/weather';

/**
 * 每日目標（見 CONTEXT.md）：第 2 天起每天準備階段出現一個、只限當天，打烊時判定。
 * 不是里程碑：不解鎖任何東西，沒達成也不扣分。
 */
export type DailyGoalKind =
  /** 賣出某類別 N 件 */
  | 'sell-category'
  /** 結帳人數達 N 人 */
  | 'served'
  /** 沒有顧客因缺貨空手離開 */
  | 'no-stockout-empty'
  /** 打烊前賣完今天到期的鮮食，明天開店前零報廢 */
  | 'zero-waste';

export type DailyGoalReward =
  | { readonly type: 'funds'; readonly amount: number }
  | { readonly type: 'reputation'; readonly delta: number };

/** 今天的每日目標（存檔用的完整定義） */
export interface DailyGoalDef {
  readonly kind: DailyGoalKind;
  /** sell-category 的類別 */
  readonly category?: CategoryId;
  /**
   * 目標數字：sell-category / served 為「至少」；
   * no-stockout-empty / zero-waste 為「至多」（一律 0）
   */
  readonly target: number;
  readonly reward: DailyGoalReward;
}

/** 每日目標與目前（或打烊時）的進度 */
export interface DailyGoalStatus extends DailyGoalDef {
  readonly description: string;
  /** 目前的數字：已賣出件數、結帳人數、因缺貨空手離開的人數、尚未賣掉的到期鮮食件數 */
  readonly current: number;
  /** 以目前的數字判定是否達成；「至多」類目標在打烊前隨時可能失敗 */
  readonly met: boolean;
}

/** 每日結算中的每日目標結果 */
export interface DailyGoalResult extends DailyGoalStatus {
  /** 實際發放的獎勵；沒達成時為 null */
  readonly granted: DailyGoalReward | null;
}

/** 挑目標與設定數字所參考的一天成績 */
export interface GoalDayStats {
  readonly served: number;
  /** 各類別賣出件數 */
  readonly sales: Readonly<Partial<Record<CategoryId, number>>>;
  /** 因缺貨空手離開的人數 */
  readonly stockoutEmpty: number;
}

/** 目標數字參考最近幾天的成績 */
export const GOAL_HISTORY_DAYS = 3;
/** 第 1 天沒有每日目標 */
export const FIRST_GOAL_DAY = 2;

/** 資金獎勵範圍 */
export const MIN_FUNDS_REWARD = 500;
export const MAX_FUNDS_REWARD = 1_500;
/** 口碑獎勵 */
export const REPUTATION_REWARD = 2;

/** 銷量 / 結帳人數目標的最低值，避免開店初期的目標太簡單 */
export const MIN_SELL_TARGET = 10;
export const MIN_SERVED_TARGET = 20;
/** 目標比最近平均高出的比例：可達成但要用心 */
const STRETCH = 1.15;
/** 銷量與結帳人數目標最多是準備階段現有庫存（倉庫與架上）的這個比例，確保今天賣得到 */
const MAX_STOCK_SHARE = 0.9;
/** 最近因缺貨空手離開的平均人數不超過這個數，才出「沒有顧客因缺貨空手離開」 */
const MAX_RECENT_STOCKOUT_EMPTY = 4;

/**
 * 天氣與星期對當天銷量的預估倍率（只用於設定目標數字，不影響模擬）。
 * 刻意比天氣實際效果溫和，目標偏向可達成。
 */
function expectedFactor(conditions: DayConditions, category: CategoryId | null): number {
  let f = 1;
  if (conditions.weather === 'rainy') f *= 0.85;
  if (conditions.weekend) f *= 1.1;
  if (category === 'drink') f *= conditions.weather === 'hot' ? 1.2 : conditions.weather === 'cold' ? 0.85 : 1;
  if (category === 'noodle') f *= conditions.weather === 'cold' ? 1.2 : conditions.weather === 'hot' ? 0.85 : 1;
  return f;
}

/** 挑選每日目標所需的店況 */
export interface GoalContext {
  readonly conditions: DayConditions;
  /** 已解鎖且有格位指定商品的類別 */
  readonly categories: readonly CategoryId[];
  /** 最近幾天的成績（舊到新，最多 GOAL_HISTORY_DAYS 天） */
  readonly history: readonly GoalDayStats[];
  /** 今天打烊後就會過期的鮮食件數（倉庫與架上） */
  readonly expiringFresh: number;
  /** 準備階段各類別的現有庫存（倉庫與架上） */
  readonly stock: Readonly<Partial<Record<CategoryId, number>>>;
}

interface Candidate {
  readonly weight: number;
  readonly goal: DailyGoalDef;
}

const average = (values: readonly number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
const roundUpTo5 = (n: number) => Math.ceil(n / 5) * 5;
const fundsReward = (amount: number): DailyGoalReward => ({
  type: 'funds',
  amount: Math.min(MAX_FUNDS_REWARD, Math.max(MIN_FUNDS_REWARD, Math.round(amount / 100) * 100)),
});
const reputationReward: DailyGoalReward = { type: 'reputation', delta: REPUTATION_REWARD };

/**
 * 賣出某類別的目標件數：最近平均銷量 × 天氣星期倍率 × 1.15，進位到 5，至少 MIN_SELL_TARGET。
 * 現有庫存的九成不到目標時回傳 null（今天賣不到，不出這個目標）
 */
export function sellTarget(ctx: GoalContext, category: CategoryId): number | null {
  const recent = average(ctx.history.map((d) => d.sales[category] ?? 0));
  const target = Math.max(MIN_SELL_TARGET, roundUpTo5(recent * expectedFactor(ctx.conditions, category) * STRETCH));
  return (ctx.stock[category] ?? 0) * MAX_STOCK_SHARE >= target ? target : null;
}

/** 結帳人數目標：最近平均結帳人數 × 天氣星期倍率 × 1.15（不超過總庫存的九成），進位到 5，至少 MIN_SERVED_TARGET */
export function servedTarget(ctx: GoalContext): number {
  const recent = average(ctx.history.map((d) => d.served));
  const wanted = roundUpTo5(recent * expectedFactor(ctx.conditions, null) * STRETCH);
  // 每位結帳的顧客至少買一件：不超過現有總庫存的九成（捨去到 5），庫存少時目標也跟著降
  const totalStock = Object.values(ctx.stock).reduce((s, n) => s + (n ?? 0), 0);
  const cap = Math.floor((totalStock * MAX_STOCK_SHARE) / 5) * 5;
  return Math.max(MIN_SERVED_TARGET, Math.min(wanted, cap));
}

/** 熱天飲料、冷天泡麵的銷量目標特別容易出現；週末偏向家庭會買的鮮食與日用品 */
function sellWeight(conditions: DayConditions, category: CategoryId): number {
  let w = 1;
  if (category === 'drink') w *= conditions.weather === 'hot' ? 4 : conditions.weather === 'cold' ? 0.3 : 1;
  if (category === 'noodle') w *= conditions.weather === 'cold' ? 4 : conditions.weather === 'hot' ? 0.3 : 1;
  if (conditions.weekend && (category === 'fresh' || category === 'daily')) w *= 1.5;
  return w;
}

/** 目標池：今天可以出的目標與權重 */
export function goalCandidates(ctx: GoalContext): Candidate[] {
  const { conditions } = ctx;
  const candidates: Candidate[] = [];
  for (const category of ctx.categories) {
    const target = sellTarget(ctx, category);
    if (target === null) continue;
    candidates.push({
      weight: sellWeight(conditions, category),
      goal: { kind: 'sell-category', category, target, reward: fundsReward(target * 20) },
    });
  }
  const served = servedTarget(ctx);
  candidates.push({
    weight: conditions.weekend ? 2 : conditions.weather === 'rainy' ? 0.5 : 1,
    goal: { kind: 'served', target: served, reward: fundsReward(served * 8) },
  });
  // 最近有人因缺貨空手離開才出（否則太簡單），但平均不能太多（否則做不到）
  const stockoutEmpty = ctx.history.map((d) => d.stockoutEmpty);
  if (
    ctx.categories.length > 0 &&
    stockoutEmpty.some((n) => n > 0) &&
    average(stockoutEmpty) <= MAX_RECENT_STOCKOUT_EMPTY
  ) {
    candidates.push({
      weight: conditions.weekend ? 1.5 : 1,
      goal: { kind: 'no-stockout-empty', target: 0, reward: reputationReward },
    });
  }
  // 有鮮食今天到期、且數量不超過最近的鮮食日銷量八成時才出（賣得完）
  const freshSales = average(ctx.history.map((d) => d.sales.fresh ?? 0));
  if (ctx.categories.includes('fresh') && ctx.expiringFresh > 0 && ctx.expiringFresh <= freshSales * 0.8) {
    candidates.push({
      weight: conditions.weather === 'rainy' ? 2 : 1,
      goal: { kind: 'zero-waste', target: 0, reward: fundsReward(600) },
    });
  }
  return candidates;
}

/** 依權重從目標池挑一個每日目標；目標池一定有結帳人數目標，所以一定挑得出來。只用一次 rng.next() */
export function pickDailyGoal(rng: Rng, ctx: GoalContext): DailyGoalDef {
  const candidates = goalCandidates(ctx);
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = rng.next() * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll < 0) return c.goal;
  }
  return (candidates[candidates.length - 1] as Candidate).goal;
}

/** 目標以「至多」判定（數字越小越好） */
export const isAtMostGoal = (kind: DailyGoalKind) => kind === 'no-stockout-empty' || kind === 'zero-waste';

export function isGoalMet(goal: DailyGoalDef, current: number): boolean {
  return isAtMostGoal(goal.kind) ? current <= goal.target : current >= goal.target;
}

export function describeDailyGoal(goal: DailyGoalDef): string {
  switch (goal.kind) {
    case 'sell-category':
      return `賣出 ${goal.target} 件${goal.category ? CATEGORIES[goal.category].name : '商品'}`;
    case 'served':
      return `結帳人數達 ${goal.target} 人`;
    case 'no-stockout-empty':
      return '沒有顧客因缺貨空手離開';
    case 'zero-waste':
      return '今天到期的鮮食零報廢';
  }
}

/** 營業日帳目中每日目標需要的數字 */
export interface GoalMeasures {
  /** 各類別今天賣出的件數 */
  readonly categorySales: (category: CategoryId) => number;
  readonly served: number;
  readonly stockoutEmpty: number;
  /** 今天打烊後就會過期、還沒賣掉的鮮食件數 */
  readonly expiringFresh: number;
}

export function goalCurrent(goal: DailyGoalDef, m: GoalMeasures): number {
  switch (goal.kind) {
    case 'sell-category':
      return goal.category ? m.categorySales(goal.category) : 0;
    case 'served':
      return m.served;
    case 'no-stockout-empty':
      return m.stockoutEmpty;
    case 'zero-waste':
      return m.expiringFresh;
  }
}

export function goalStatus(goal: DailyGoalDef, m: GoalMeasures): DailyGoalStatus {
  const current = goalCurrent(goal, m);
  return { ...goal, description: describeDailyGoal(goal), current, met: isGoalMet(goal, current) };
}

/** 每日目標專用亂數流的種子：由遊戲種子衍生，與主亂數流、天氣亂數流分開 */
export function dailyGoalSeed(seed: number): number {
  return (Math.imul((seed ^ 0x2545f491) >>> 0, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
}
