import type { CategoryId } from '../catalog/products';
import type { Rng } from '../rng';
import type { DayConditions, Weather } from '../weather/weather';
import { CLOSE_MINUTE, OPEN_MINUTE } from '../clock/clock';

/** 打烊前這麼多分鐘起不再有新顧客進店 */
export const LAST_ENTRY_BEFORE_CLOSE = 30;

/** 顧客類型：上班族、學生、家庭 */
export type CustomerType = 'office' | 'student' | 'family';

export const CUSTOMER_TYPE_IDS: readonly CustomerType[] = ['office', 'student', 'family'];

/** 時段曲線上的一個尖峰：中心時刻（分鐘）、高度（每小時）、寬度（分鐘） */
interface Peak {
  readonly center: number;
  readonly height: number;
  readonly width: number;
}

/** 顧客類型的參數 */
export interface CustomerTypeDef {
  readonly name: string;
  /** 平日的時段曲線：整天的基本來客（每遊戲小時）加上尖峰 */
  readonly base: number;
  readonly peaks: readonly Peak[];
  /** 週末的時段曲線倍率；上班族不指定，由週末總量不變推出（見 WEEKEND_OFFICE_SCALE） */
  readonly weekendScale?: number;
  /** 購物清單各類別的相對權重 */
  readonly categoryWeight: Readonly<Record<CategoryId, number>>;
  /** 價格敏感度：售價比建議售價每貴 1%，購買機率下降的百分點 */
  readonly priceSensitivity: number;
  /** 排隊耐心（步數）的範圍 */
  readonly patience: readonly [number, number];
}

/**
 * 各類型的參數。晴天平日三條曲線相加的整天來客量與改動前的單一曲線相近（約 101 對 102 人）；
 * 清單比重以平日的類型比例加權後，與改動前的整體比重相近。
 */
export const CUSTOMER_TYPES: Readonly<Record<CustomerType, CustomerTypeDef>> = {
  office: {
    name: '上班族',
    base: 1.1,
    // 上班前、午休、下班後
    peaks: [
      { center: 8 * 60, height: 7.5, width: 50 },
      { center: 12 * 60 + 30, height: 4.5, width: 45 },
      { center: 18 * 60 + 30, height: 7, width: 60 },
    ],
    categoryWeight: { drink: 7, fresh: 5, snack: 2, noodle: 1.5, daily: 0.5 },
    priceSensitivity: 1.5,
    patience: [65, 115],
  },
  student: {
    name: '學生',
    base: 0.4,
    // 午餐與放學後
    peaks: [
      { center: 12 * 60 + 30, height: 2, width: 40 },
      { center: 16 * 60 + 30, height: 4, width: 60 },
    ],
    weekendScale: 1,
    categoryWeight: { drink: 3, fresh: 1.5, snack: 6, noodle: 4, daily: 0.5 },
    priceSensitivity: 3,
    patience: [80, 140],
  },
  family: {
    name: '家庭',
    base: 0.6,
    // 白天
    peaks: [{ center: 13 * 60, height: 3, width: 120 }],
    weekendScale: 1.65,
    categoryWeight: { drink: 2.5, fresh: 4.5, snack: 2.5, noodle: 1.5, daily: 3.5 },
    priceSensitivity: 2,
    patience: [100, 170],
  },
};

/** 此類型在平日此時刻的曲線值（未乘週末倍率） */
function weekdayTypeRate(type: CustomerType, minuteOfDay: number): number {
  const def = CUSTOMER_TYPES[type];
  return def.peaks.reduce(
    (rate, p) => rate + p.height * Math.exp(-((minuteOfDay - p.center) ** 2) / (2 * p.width ** 2)),
    def.base,
  );
}

/** 營業時段中會有新顧客進店的時段 [開店, 最後進店) 內，此函式的整天積分（人） */
function dailyIntegral(rate: (minute: number) => number): number {
  let sum = 0;
  for (let m = OPEN_MINUTE; m < CLOSE_MINUTE - LAST_ENTRY_BEFORE_CLOSE; m++) sum += rate(m + 0.5) / 60;
  return sum;
}

const WEEKDAY_TOTALS: Readonly<Record<CustomerType, number>> = Object.fromEntries(
  CUSTOMER_TYPE_IDS.map((t) => [t, dailyIntegral((m) => weekdayTypeRate(t, m))]),
) as Record<CustomerType, number>;

/**
 * 週末上班族的曲線倍率：讓週末三條曲線的整天總量等於平日（週末多出的來客由 WEEKEND_ARRIVALS 表達），
 * 家庭、學生的倍率見 CUSTOMER_TYPES.weekendScale；結果是週末家庭比例提高、上班族比例降低。
 */
export const WEEKEND_OFFICE_SCALE =
  (CUSTOMER_TYPE_IDS.reduce((s, t) => s + WEEKDAY_TOTALS[t], 0) -
    WEEKDAY_TOTALS.student * (CUSTOMER_TYPES.student.weekendScale ?? 1) -
    WEEKDAY_TOTALS.family * (CUSTOMER_TYPES.family.weekendScale ?? 1)) /
  WEEKDAY_TOTALS.office;

function weekendScale(type: CustomerType): number {
  return type === 'office' ? WEEKEND_OFFICE_SCALE : (CUSTOMER_TYPES[type].weekendScale ?? 1);
}

/** 此類型在此時刻、口碑倍率為 1 時的來客速率（人 / 遊戲小時）；週末時家庭較多、上班族較少 */
export function typeArrivalsPerHour(type: CustomerType, minuteOfDay: number, weekend = false): number {
  return weekdayTypeRate(type, minuteOfDay) * (weekend ? weekendScale(type) : 1);
}

/** 此時刻、口碑倍率為 1 時的來客速率（人 / 遊戲小時）：三種類型的曲線相加 */
export function arrivalsPerHour(minuteOfDay: number, weekend = false): number {
  return CUSTOMER_TYPE_IDS.reduce((s, t) => s + typeArrivalsPerHour(t, minuteOfDay, weekend), 0);
}

/** 整天各類型來客的比例（加總為 1）；天氣與口碑倍率對各類型相同，只有星期會改變比例 */
export function dayTypeMix(weekend: boolean): Readonly<Record<CustomerType, number>> {
  const totals = CUSTOMER_TYPE_IDS.map((t) => WEEKDAY_TOTALS[t] * (weekend ? weekendScale(t) : 1));
  const sum = totals.reduce((a, b) => a + b, 0);
  return Object.fromEntries(CUSTOMER_TYPE_IDS.map((t, i) => [t, (totals[i] as number) / sum])) as Record<
    CustomerType,
    number
  >;
}

/** 此時刻新進店顧客的類型：依各類型此刻的來客速率比例抽 */
export function rollCustomerType(rng: Rng, minuteOfDay: number, weekend: boolean): CustomerType {
  const rates = CUSTOMER_TYPE_IDS.map((t) => typeArrivalsPerHour(t, minuteOfDay, weekend));
  let roll = rng.next() * rates.reduce((a, b) => a + b, 0);
  const index = rates.findIndex((r) => (roll -= r) < 0);
  return CUSTOMER_TYPE_IDS[index === -1 ? CUSTOMER_TYPE_IDS.length - 1 : index] as CustomerType;
}

/** 此類型顧客的排隊耐心（步數）：在類型的範圍內均勻抽 */
export function rollPatience(rng: Rng, type: CustomerType): number {
  return rng.int(...CUSTOMER_TYPES[type].patience);
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

/** 店內同時最多的顧客數 */
export const MAX_CUSTOMERS_IN_STORE = 20;

/** 未指定顧客類型時，各類別出現在購物清單的相對權重（類型出現前的整體比重） */
const CATEGORY_WEIGHT: Record<CategoryId, number> = {
  drink: 5,
  fresh: 4,
  snack: 3,
  noodle: 2,
  daily: 1,
};

/** 清單長度的範圍（均勻抽） */
const LIST_SIZE: readonly [number, number] = [1, 3];

/** 類別權重：顧客類型的比重（未指定類型時為整體比重）× 類別需求倍率 */
function categoryWeight(demandMultiplier: DemandMultipliers, type: CustomerType | undefined) {
  const base = type ? CUSTOMER_TYPES[type].categoryWeight : CATEGORY_WEIGHT;
  return (c: CategoryId) => base[c] * (demandMultiplier[c] ?? 1);
}

/**
 * 產生購物清單：從可販售的類別中抽 1–3 個不重複類別。
 * 類別比重依顧客類型；demandMultiplier 為各類別權重的倍率（例如熱浪時飲料 ×2），未列出的類別為 1。
 */
export function rollShoppingList(
  rng: Rng,
  available: readonly CategoryId[],
  demandMultiplier: DemandMultipliers = {},
  type?: CustomerType,
): CategoryId[] {
  const pool = [...available];
  const weight = categoryWeight(demandMultiplier, type);
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
  type?: CustomerType,
): Partial<Record<CategoryId, number>> {
  const weight = categoryWeight(demandMultiplier, type);
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

/**
 * 某天的顧客平均起來，購物清單出現該類別的機率：各類型的 listShare 依當天的類型比例（dayTypeMix）加權。
 * 供平衡策略依預報估算需求。
 */
export function expectedListShare(
  available: readonly CategoryId[],
  demandMultiplier: DemandMultipliers,
  weekend: boolean,
): Partial<Record<CategoryId, number>> {
  const mix = dayTypeMix(weekend);
  const out: Partial<Record<CategoryId, number>> = Object.fromEntries(available.map((c) => [c, 0]));
  for (const type of CUSTOMER_TYPE_IDS) {
    const share = listShare(available, demandMultiplier, type);
    for (const c of available) out[c] = (out[c] ?? 0) + mix[type] * (share[c] ?? 0);
  }
  return out;
}

/** 未指定顧客類型時：售價比建議售價每貴 1%，購買機率下降 2% */
const PRICE_SENSITIVITY = 2;

/**
 * 依售價決定購買機率：不高於建議售價必買；貴的幅度乘上價格敏感度後扣減
 * （未指定類型時貴 50% 以上不買；學生更在意、上班族較不在意）。折扣不影響購買機率。
 */
export function purchaseProbability(salePrice: number, suggestedPrice: number, type?: CustomerType): number {
  const markup = salePrice / suggestedPrice - 1;
  const sensitivity = type ? CUSTOMER_TYPES[type].priceSensitivity : PRICE_SENSITIVITY;
  return Math.min(1, Math.max(0, 1 - sensitivity * markup));
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
