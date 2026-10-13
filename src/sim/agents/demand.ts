import type { CategoryId } from '../catalog/products';
import type { Rng } from '../rng';

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

/**
 * 產生購物清單：從可販售的類別中抽 1–3 個不重複類別。
 * demandMultiplier 為各類別權重的倍率（例如熱浪時飲料 ×2）；未列出的類別為 1。
 */
export function rollShoppingList(
  rng: Rng,
  available: readonly CategoryId[],
  demandMultiplier: Partial<Readonly<Record<CategoryId, number>>> = {},
): CategoryId[] {
  const pool = [...available];
  const weight = (c: CategoryId) => CATEGORY_WEIGHT[c] * (demandMultiplier[c] ?? 1);
  const size = Math.min(pool.length, rng.int(1, 3));
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
