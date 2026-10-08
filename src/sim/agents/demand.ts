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

/** 產生購物清單：從可販售的類別中抽 1–3 個不重複類別 */
export function rollShoppingList(rng: Rng, available: readonly CategoryId[]): CategoryId[] {
  const pool = [...available];
  const size = Math.min(pool.length, rng.int(1, 3));
  const list: CategoryId[] = [];
  for (let i = 0; i < size; i++) {
    const total = pool.reduce((s, c) => s + CATEGORY_WEIGHT[c], 0);
    let roll = rng.next() * total;
    const index = pool.findIndex((c) => (roll -= CATEGORY_WEIGHT[c]) < 0);
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
