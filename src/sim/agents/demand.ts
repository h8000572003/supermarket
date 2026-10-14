import type { CategoryId } from '../catalog/products';
import type { Rng } from '../rng';
import type { DayConditions, Weather } from '../weather/weather';

/** 離峰的基本來客（每遊戲小時） */
const BASE_PER_HOUR = 3;

/** 早餐、午餐、晚餐三個尖峰：中心時刻（分鐘）、高度（每小時）、寬度（分鐘） */
const PEAKS: readonly { center: number; height: number; width: number }[] = [
  { center: 8 * 60, height: 8, width: 50 },
  { center: 12 * 60 + 30, height: 10, width: 50 },
  { center: 18 * 60 + 30, height: 8, width: 60 },
];

/** 此時刻、口碑倍率為 1 時的來客速率（人 / 遊戲小時） */
export function arrivalsPerHour(minuteOfDay: number): number {
  return PEAKS.reduce(
    (rate, p) => rate + p.height * Math.exp(-((minuteOfDay - p.center) ** 2) / (2 * p.width ** 2)),
    BASE_PER_HOUR,
  );
}

/** 各天氣的來客倍率（以晴天為 1） */
export const WEATHER_ARRIVALS: Readonly<Record<Weather, number>> = { sunny: 1, rainy: 0.75, hot: 1, cold: 1 };

/** 週末的來客倍率（以平日為 1） */
export const WEEKEND_ARRIVALS = 1.2;

/** 這一天的天氣與星期造成的來客倍率（晴天平日為 1）；與口碑倍率、狀況的暫時來客倍率相乘 */
export function conditionsArrivalMultiplier(c: Pick<DayConditions, 'weather' | 'weekend'>): number {
  return WEATHER_ARRIVALS[c.weather] * (c.weekend ? WEEKEND_ARRIVALS : 1);
}

/** 類別需求倍率：作用在購物清單的類別權重上；未列出的類別為 1 */
export type DemandMultipliers = Partial<Readonly<Record<CategoryId, number>>>;

/** 各天氣的類別需求倍率（以晴天為基準） */
export const WEATHER_DEMAND: Readonly<Record<Weather, DemandMultipliers>> = {
  sunny: {},
  rainy: {},
  hot: { drink: 2, noodle: 0.5 },
  cold: { noodle: 2, drink: 0.6 },
};

/** 合併多組類別需求倍率：同一類別的倍率相乘（例如天氣 × 狀況） */
export function combineDemand(...sets: readonly DemandMultipliers[]): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = {};
  for (const set of sets) {
    for (const [c, m] of Object.entries(set) as [CategoryId, number][]) out[c] = (out[c] ?? 1) * m;
  }
  return out;
}

/** 打烊前這麼多分鐘起不再有新顧客進店 */
export const LAST_ENTRY_BEFORE_CLOSE = 30;

/** 店內同時最多的顧客數 */
export const MAX_CUSTOMERS_IN_STORE = 20;

/** 各類別出現在購物清單的相對權重 */
const CATEGORY_WEIGHT: Record<CategoryId, number> = {
  drink: 5,
  fresh: 4,
  snack: 3,
  noodle: 2,
  daily: 1,
};

/** 清單長度的範圍（均勻抽） */
const LIST_SIZE: readonly [number, number] = [1, 3];

/**
 * 產生購物清單：從可販售的類別中抽 1–3 個不重複類別。
 * demandMultiplier 為各類別權重的倍率（例如熱浪時飲料 ×2）；未列出的類別為 1。
 */
export function rollShoppingList(
  rng: Rng,
  available: readonly CategoryId[],
  demandMultiplier: DemandMultipliers = {},
): CategoryId[] {
  const pool = [...available];
  const weight = (c: CategoryId) => CATEGORY_WEIGHT[c] * (demandMultiplier[c] ?? 1);
  const size = Math.min(pool.length, rng.int(...LIST_SIZE));
  const list: CategoryId[] = [];
  for (let i = 0; i < size; i++) {
    const total = pool.reduce((s, c) => s + weight(c), 0);
    let roll = rng.next() * total;
    const index = pool.findIndex((c) => (roll -= weight(c)) < 0);
    const [picked] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
    if (picked) list.push(picked);
  }
  return list;
}

/**
 * 每位顧客的購物清單出現該類別的機率（與 rollShoppingList 同一套抽法的精確期望值）。
 * 供平衡策略估算需求，也讓倍率的效果可以直接驗證。
 */
export function listShare(
  available: readonly CategoryId[],
  demandMultiplier: DemandMultipliers = {},
): Partial<Record<CategoryId, number>> {
  const weight = (c: CategoryId) => CATEGORY_WEIGHT[c] * (demandMultiplier[c] ?? 1);
  const share: Partial<Record<CategoryId, number>> = Object.fromEntries(available.map((c) => [c, 0]));
  const sizes = LIST_SIZE[1] - LIST_SIZE[0] + 1;
  // 逐次抽取：pool 為剩下的類別，p 為走到這一步的機率，left 為還要抽幾個
  const walk = (pool: readonly CategoryId[], p: number, left: number) => {
    if (left === 0 || pool.length === 0) return;
    const total = pool.reduce((s, c) => s + weight(c), 0);
    for (const c of pool) {
      const q = total > 0 ? (p * weight(c)) / total : 0;
      if (q === 0) continue;
      share[c] = (share[c] ?? 0) + q;
      walk(
        pool.filter((x) => x !== c),
        q,
        left - 1,
      );
    }
  };
  for (let size = LIST_SIZE[0]; size <= LIST_SIZE[1]; size++) walk(available, 1 / sizes, size);
  return share;
}

/** 售價比建議售價每貴 1%，購買機率下降 2% */
const PRICE_SENSITIVITY = 2;

/** 依售價決定購買機率：不高於建議售價必買，貴 50% 以上不買 */
export function purchaseProbability(salePrice: number, suggestedPrice: number): number {
  const markup = salePrice / suggestedPrice - 1;
  return Math.min(1, Math.max(0, 1 - PRICE_SENSITIVITY * markup));
}

/** 一次無扣分、照建議售價的購物的滿意度 */
export const BASE_SATISFACTION = 85;

/** 整次購物的折扣加分上限 */
export const MAX_DISCOUNT_BONUS = 15;

/** 售價比建議售價每便宜 1%，該件商品加 0.5 分 */
const DISCOUNT_BONUS_RATE = 50;

/** 單件商品的折扣加分：依低於建議售價的幅度；不低於建議售價時為 0 */
export function discountBonus(salePrice: number, suggestedPrice: number): number {
  return Math.max(0, 1 - salePrice / suggestedPrice) * DISCOUNT_BONUS_RATE;
}

/** 結帳顧客的滿意度：基準加折扣加分（有上限），減去缺貨、嫌貴、排隊等扣分，限制在 0–100 */
export function checkoutSatisfaction(
  items: readonly { readonly salePrice: number; readonly suggestedPrice: number }[],
  penalty: number,
): number {
  const bonus = items.reduce((sum, i) => sum + discountBonus(i.salePrice, i.suggestedPrice), 0);
  return clampSatisfaction(BASE_SATISFACTION + Math.min(MAX_DISCOUNT_BONUS, bonus) - penalty);
}

/** 滿意度限制在 0–100 */
export const clampSatisfaction = (n: number) => Math.min(100, Math.max(0, n));
