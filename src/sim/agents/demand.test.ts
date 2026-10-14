import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import type { CategoryId } from '../catalog/products';
import {
  BASE_SATISFACTION,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_IDS,
  LAST_ENTRY_BEFORE_CLOSE,
  dayTypeMix,
  expectedListShare,
  rollCustomerType,
  rollPatience,
  typeArrivalsPerHour,
  MAX_DISCOUNT_BONUS,
  WEATHER_DEMAND,
  arrivalsPerHour,
  checkoutSatisfaction,
  combineDemand,
  conditionsArrivalMultiplier,
  discountBonus,
  listShare,
  purchaseProbability,
  rollShoppingList,
} from './demand';
import type { CustomerType, DemandMultipliers } from './demand';
import { CLOSE_MINUTE, OPEN_MINUTE } from '../clock/clock';

/** 整天（開店到最後進店）的積分：人數 */
function perDay(rate: (minute: number) => number): number {
  let sum = 0;
  for (let m = OPEN_MINUTE; m < CLOSE_MINUTE - LAST_ENTRY_BEFORE_CLOSE; m++) sum += rate(m + 0.5) / 60;
  return sum;
}

/** 顧客類型出現前的單一來客曲線（凍結的舊值，用來確認晴天平日總量沒變） */
function previousArrivalsPerHour(minute: number): number {
  const peaks = [
    { center: 8 * 60, height: 8, width: 50 },
    { center: 12 * 60 + 30, height: 10, width: 50 },
    { center: 18 * 60 + 30, height: 8, width: 60 },
  ];
  return peaks.reduce((r, p) => r + p.height * Math.exp(-((minute - p.center) ** 2) / (2 * p.width ** 2)), 3);
}

/** 營業時段內，此類型曲線最高的時刻（分鐘） */
function peakMinute(type: CustomerType, from = OPEN_MINUTE, to = CLOSE_MINUTE): number {
  let best = from;
  for (let m = from; m < to; m++) if (typeArrivalsPerHour(type, m) > typeArrivalsPerHour(type, best)) best = m;
  return best;
}

const at = (h: number, m = 0) => h * 60 + m;

describe('來客曲線', () => {
  it('午餐尖峰高於下午離峰，深夜最低', () => {
    expect(arrivalsPerHour(12 * 60 + 30)).toBeGreaterThan(arrivalsPerHour(15 * 60) * 2);
    expect(arrivalsPerHour(22 * 60)).toBeLessThan(arrivalsPerHour(8 * 60));
  });

  it('總來客速率是三種類型的曲線相加（平日與週末）', () => {
    for (const minute of [at(7), at(8), at(12, 30), at(16), at(19), at(22)]) {
      for (const weekend of [false, true]) {
        const sum = CUSTOMER_TYPE_IDS.reduce((s, t) => s + typeArrivalsPerHour(t, minute, weekend), 0);
        expect(arrivalsPerHour(minute, weekend)).toBeCloseTo(sum, 10);
      }
    }
  });

  it('上班族：早上與傍晚兩個尖峰，比白天離峰高得多', () => {
    expect(peakMinute('office', OPEN_MINUTE, at(10))).toBeGreaterThanOrEqual(at(7, 30));
    expect(peakMinute('office', OPEN_MINUTE, at(10))).toBeLessThanOrEqual(at(8, 30));
    expect(peakMinute('office', at(16), CLOSE_MINUTE)).toBeGreaterThanOrEqual(at(18));
    expect(peakMinute('office', at(16), CLOSE_MINUTE)).toBeLessThanOrEqual(at(19));
    const offPeak = typeArrivalsPerHour('office', at(15));
    expect(typeArrivalsPerHour('office', at(8))).toBeGreaterThan(offPeak * 4);
    expect(typeArrivalsPerHour('office', at(18, 30))).toBeGreaterThan(offPeak * 4);
    // 早上與傍晚是上班族最多的時段
    expect(peakMinute('office')).toBeLessThan(at(9));
  });

  it('學生：下午（放學後）最多，早上很少', () => {
    const peak = peakMinute('student');
    expect(peak).toBeGreaterThanOrEqual(at(15));
    expect(peak).toBeLessThanOrEqual(at(18));
    expect(typeArrivalsPerHour('student', peak)).toBeGreaterThan(typeArrivalsPerHour('student', at(8)) * 4);
  });

  it('家庭：白天最多，早晚較少', () => {
    const peak = peakMinute('family');
    expect(peak).toBeGreaterThanOrEqual(at(11));
    expect(peak).toBeLessThanOrEqual(at(15));
    expect(typeArrivalsPerHour('family', peak)).toBeGreaterThan(typeArrivalsPerHour('family', at(8)) * 2.5);
    expect(typeArrivalsPerHour('family', peak)).toBeGreaterThan(typeArrivalsPerHour('family', at(21)) * 2.5);
  });

  it('各時段的主要客群：早上與傍晚上班族、放學後學生多於上班族、下午家庭多於上班族', () => {
    const rate = (t: CustomerType, m: number) => typeArrivalsPerHour(t, m);
    for (const m of [at(8), at(18, 30)]) {
      expect(rate('office', m)).toBeGreaterThan(rate('student', m) + rate('family', m));
    }
    expect(rate('student', at(16, 30))).toBeGreaterThan(rate('office', at(16, 30)));
    expect(rate('family', at(14))).toBeGreaterThan(rate('office', at(14)));
  });

  it('晴天平日的整天總來客量與改動前相近（±5%）', () => {
    const before = perDay(previousArrivalsPerHour);
    const after = perDay((m) => arrivalsPerHour(m));
    expect(Math.abs(after / before - 1)).toBeLessThan(0.05);
  });

  it('週末的時段曲線總量與平日相同（週末多出的來客由週末倍率表達），家庭比例提高', () => {
    expect(perDay((m) => arrivalsPerHour(m, true))).toBeCloseTo(perDay((m) => arrivalsPerHour(m)), 6);
    const weekday = dayTypeMix(false);
    const weekend = dayTypeMix(true);
    expect(weekend.family).toBeGreaterThan(weekday.family + 0.1);
    expect(weekend.office).toBeLessThan(weekday.office);
    for (const mix of [weekday, weekend]) {
      expect(CUSTOMER_TYPE_IDS.reduce((s, t) => s + mix[t], 0)).toBeCloseTo(1);
    }
    // 比例與積分一致
    for (const t of CUSTOMER_TYPE_IDS) {
      expect(weekday[t]).toBeCloseTo(perDay((m) => typeArrivalsPerHour(t, m)) / perDay((m) => arrivalsPerHour(m)), 6);
    }
  });

  it('新顧客的類型依此刻各類型的來客速率比例抽', () => {
    const rolled = (minute: number, weekend: boolean, n = 3000) => {
      const rng = Rng.fromSeed(13);
      const count: Record<CustomerType, number> = { office: 0, student: 0, family: 0 };
      for (let i = 0; i < n; i++) count[rollCustomerType(rng, minute, weekend)]++;
      return (t: CustomerType) => count[t] / n;
    };
    for (const [minute, weekend] of [
      [at(8), false],
      [at(16, 30), false],
      [at(13), true],
    ] as const) {
      const share = rolled(minute, weekend);
      const total = arrivalsPerHour(minute, weekend);
      for (const t of CUSTOMER_TYPE_IDS) {
        expect(share(t)).toBeCloseTo(typeArrivalsPerHour(t, minute, weekend) / total, 1);
      }
    }
  });
});

describe('顧客類型的購物清單、價格敏感度與耐心', () => {
  const ALL: CategoryId[] = ['drink', 'fresh', 'snack', 'noodle', 'daily'];
  const top2 = (type: CustomerType) =>
    Object.entries(listShare(ALL, {}, type))
      .sort((a, b) => b[1]! - a[1]!)
      .slice(0, 2)
      .map(([c]) => c)
      .sort();

  it('上班族偏好飲料與鮮食、學生偏好零食與泡麵、家庭偏好日用品與鮮食', () => {
    expect(top2('office')).toEqual(['drink', 'fresh']);
    expect(top2('student')).toEqual(['noodle', 'snack']);
    expect(top2('family')).toEqual(['daily', 'fresh']);
    const share = (t: CustomerType) => listShare(ALL, {}, t);
    // 每種偏好都高於其他兩種類型
    expect(share('office').drink!).toBeGreaterThan(Math.max(share('student').drink!, share('family').drink!));
    expect(share('student').snack!).toBeGreaterThan(Math.max(share('office').snack!, share('family').snack!));
    expect(share('student').noodle!).toBeGreaterThan(Math.max(share('office').noodle!, share('family').noodle!));
    expect(share('family').daily!).toBeGreaterThan(Math.max(share('office').daily!, share('student').daily!));
    expect(share('family').fresh!).toBeGreaterThan(share('student').fresh!);
    expect(share('office').fresh!).toBeGreaterThan(share('student').fresh!);
  });

  it('類型的比重仍乘上天氣與狀況的類別需求倍率；擲出的比例與 listShare 相符', () => {
    for (const type of CUSTOMER_TYPE_IDS) {
      for (const multiplier of [{}, WEATHER_DEMAND.hot, combineDemand(WEATHER_DEMAND.cold, { drink: 2 })]) {
        const rng = Rng.fromSeed(31);
        const count: Partial<Record<CategoryId, number>> = {};
        const n = 3000;
        for (let i = 0; i < n; i++) {
          for (const c of rollShoppingList(rng, ALL, multiplier, type)) count[c] = (count[c] ?? 0) + 1;
        }
        const expected = listShare(ALL, multiplier, type);
        for (const c of ALL) expect((count[c] ?? 0) / n).toBeCloseTo(expected[c]!, 1);
      }
      expect(listShare(ALL, WEATHER_DEMAND.hot, type).drink!).toBeGreaterThan(listShare(ALL, {}, type).drink!);
      expect(listShare(ALL, WEATHER_DEMAND.hot, type).noodle!).toBeLessThan(listShare(ALL, {}, type).noodle!);
      expect(listShare(ALL, WEATHER_DEMAND.cold, type).noodle!).toBeGreaterThan(listShare(ALL, {}, type).noodle!);
    }
  });

  it('整天的期望清單比重 = 各類型 listShare 依當天類型比例加權；與類型出現前的整體比重相近', () => {
    for (const weekend of [false, true]) {
      const mix = dayTypeMix(weekend);
      const expected = expectedListShare(ALL, WEATHER_DEMAND.hot, weekend);
      for (const c of ALL) {
        const manual = CUSTOMER_TYPE_IDS.reduce((s, t) => s + mix[t] * listShare(ALL, WEATHER_DEMAND.hot, t)[c]!, 0);
        expect(expected[c]).toBeCloseTo(manual, 10);
      }
    }
    // 平日的整體比重與舊的單一比重相差不到 0.03（原本的進貨方式不會突然失效）
    const before = listShare(ALL);
    const after = expectedListShare(ALL, {}, false);
    for (const c of ALL) expect(Math.abs(after[c]! - before[c]!)).toBeLessThan(0.03);
    // 週末家庭多：日用品的比重提高
    expect(expectedListShare(ALL, {}, true).daily!).toBeGreaterThan(after.daily!);
  });

  it('價格敏感度：學生 > 家庭 > 上班族，只作用在漲價；不高於建議售價時都必買', () => {
    const p = (t: CustomerType, price: number) => purchaseProbability(price, 100, t);
    expect(CUSTOMER_TYPES.student.priceSensitivity).toBeGreaterThan(CUSTOMER_TYPES.family.priceSensitivity);
    expect(CUSTOMER_TYPES.family.priceSensitivity).toBeGreaterThan(CUSTOMER_TYPES.office.priceSensitivity);
    for (const price of [110, 120, 130]) {
      expect(p('student', price)).toBeLessThan(p('family', price));
      expect(p('family', price)).toBeLessThan(p('office', price));
    }
    expect(p('office', 120)).toBeCloseTo(1 - CUSTOMER_TYPES.office.priceSensitivity * 0.2);
    expect(p('student', 120)).toBeCloseTo(1 - CUSTOMER_TYPES.student.priceSensitivity * 0.2);
    for (const t of CUSTOMER_TYPE_IDS) {
      expect(p(t, 100)).toBe(1);
      expect(p(t, 70)).toBe(1);
      expect(p(t, 300)).toBe(0);
    }
  });

  it('折扣加分不分類型（滿意度只看售價與建議售價）', () => {
    // checkoutSatisfaction / discountBonus 不接受類型：同樣的購物得到同樣的加分
    expect(discountBonus(80, 100)).toBeCloseTo(10);
  });

  it('耐心：上班族較短、家庭較長；抽出的值都在類型的範圍內', () => {
    const mean = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
    expect(mean(CUSTOMER_TYPES.office.patience)).toBeLessThan(mean(CUSTOMER_TYPES.student.patience));
    expect(mean(CUSTOMER_TYPES.student.patience)).toBeLessThan(mean(CUSTOMER_TYPES.family.patience));
    const rng = Rng.fromSeed(3);
    for (const t of CUSTOMER_TYPE_IDS) {
      const [lo, hi] = CUSTOMER_TYPES[t].patience;
      for (let i = 0; i < 300; i++) {
        const v = rollPatience(rng, t);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe('購物清單', () => {
  it('1–3 個不重複、且都來自可販售類別', () => {
    const rng = Rng.fromSeed(5);
    for (let i = 0; i < 200; i++) {
      const list = rollShoppingList(rng, ['drink', 'snack', 'noodle']);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(3);
      expect(new Set(list).size).toBe(list.length);
      for (const c of list) expect(['drink', 'snack', 'noodle']).toContain(c);
    }
  });

  it('可販售類別只有一個時清單只有它', () => {
    expect(rollShoppingList(Rng.fromSeed(1), ['snack'])).toEqual(['snack']);
  });

  it('類別需求倍率提高該類別出現在清單的機率（熱浪時飲料 ×2）', () => {
    const share = (multiplier: Partial<Record<'drink', number>>) => {
      const rng = Rng.fromSeed(9);
      let drink = 0;
      for (let i = 0; i < 2000; i++) {
        // 只抽 1 個類別時，飲料的機率 = 權重比例
        if (rollShoppingList(rng, ['drink', 'snack', 'noodle'], multiplier)[0] === 'drink') drink++;
      }
      return drink / 2000;
    };
    const normal = share({});
    const doubled = share({ drink: 2 });
    // 第一個抽到的類別：平常 5/10，加倍後 10/15
    expect(normal).toBeCloseTo(0.5, 1);
    expect(doubled).toBeCloseTo(2 / 3, 1);
  });
});

describe('天氣與星期的倍率', () => {
  it('來客：晴天平日為基準；雨天 −25%、週末 +20%，兩者相乘', () => {
    expect(conditionsArrivalMultiplier({ weather: 'sunny', weekend: false })).toBe(1);
    expect(conditionsArrivalMultiplier({ weather: 'hot', weekend: false })).toBe(1);
    expect(conditionsArrivalMultiplier({ weather: 'cold', weekend: false })).toBe(1);
    expect(conditionsArrivalMultiplier({ weather: 'rainy', weekend: false })).toBeCloseTo(0.75);
    expect(conditionsArrivalMultiplier({ weather: 'sunny', weekend: true })).toBeCloseTo(1.2);
    expect(conditionsArrivalMultiplier({ weather: 'rainy', weekend: true })).toBeCloseTo(0.9);
  });

  it('類別需求：熱天飲料 ×2、泡麵 ×0.5；冷天泡麵 ×2、飲料 ×0.6；晴天與雨天不變', () => {
    expect(WEATHER_DEMAND.hot).toEqual({ drink: 2, noodle: 0.5 });
    expect(WEATHER_DEMAND.cold).toEqual({ noodle: 2, drink: 0.6 });
    expect(WEATHER_DEMAND.sunny).toEqual({});
    expect(WEATHER_DEMAND.rainy).toEqual({});
  });

  it('天氣與狀況的類別需求倍率相乘（冷天遇上熱浪：飲料 0.6 × 2）', () => {
    expect(combineDemand(WEATHER_DEMAND.cold, { drink: 2 })).toEqual({ noodle: 2, drink: 1.2 });
    expect(combineDemand({}, { drink: 2 })).toEqual({ drink: 2 });
    expect(combineDemand(WEATHER_DEMAND.hot, {})).toEqual(WEATHER_DEMAND.hot);
  });
});

describe('購物清單的類別比重', () => {
  const ALL: CategoryId[] = ['drink', 'fresh', 'snack', 'noodle', 'daily'];

  /** 實際擲 n 張購物清單，各類別出現的比例 */
  function rolledShare(available: CategoryId[], multiplier: DemandMultipliers, n = 4000) {
    const rng = Rng.fromSeed(21);
    const count: Partial<Record<CategoryId, number>> = {};
    for (let i = 0; i < n; i++) {
      for (const c of rollShoppingList(rng, available, multiplier)) count[c] = (count[c] ?? 0) + 1;
    }
    return (c: CategoryId) => (count[c] ?? 0) / n;
  }

  it('listShare 是 rollShoppingList 的期望值：與實際擲出的比例相符，總和為平均清單長度', () => {
    for (const multiplier of [{}, WEATHER_DEMAND.hot, WEATHER_DEMAND.cold]) {
      const expected = listShare(ALL, multiplier);
      const rolled = rolledShare(ALL, multiplier);
      for (const c of ALL) expect(rolled(c)).toBeCloseTo(expected[c]!, 1);
      // 清單 1–3 個類別均勻抽：平均 2 個
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBeCloseTo(2);
    }
  });

  it.each([
    ['起始三類', ['drink', 'snack', 'noodle'] as CategoryId[]],
    ['全部類別', ALL],
  ])('熱天購物清單出現飲料的比例提高、泡麵降低；冷天相反（%s）', (_label, available) => {
    const sunny = rolledShare(available, {});
    const hot = rolledShare(available, WEATHER_DEMAND.hot);
    const cold = rolledShare(available, WEATHER_DEMAND.cold);
    expect(hot('drink')).toBeGreaterThan(sunny('drink') + 0.05);
    expect(hot('noodle')).toBeLessThan(sunny('noodle') - 0.05);
    expect(cold('noodle')).toBeGreaterThan(sunny('noodle') + 0.05);
    expect(cold('drink')).toBeLessThan(sunny('drink') - 0.05);
    // 期望值同方向
    const share = (m: DemandMultipliers) => listShare(available, m);
    expect(share(WEATHER_DEMAND.hot).drink!).toBeGreaterThan(share({}).drink!);
    expect(share(WEATHER_DEMAND.cold).noodle!).toBeGreaterThan(share({}).noodle!);
  });
});

describe('價格敏感度', () => {
  it('不高於建議售價必買', () => {
    expect(purchaseProbability(30, 30)).toBe(1);
    expect(purchaseProbability(20, 30)).toBe(1);
  });

  it('貴 25% 時一半機率、貴 50% 以上不買', () => {
    expect(purchaseProbability(25, 20)).toBeCloseTo(0.5);
    expect(purchaseProbability(30, 20)).toBe(0);
    expect(purchaseProbability(60, 20)).toBe(0);
  });
});

describe('滿意度', () => {
  const at = (salePrice: number, suggestedPrice = 100) => ({ salePrice, suggestedPrice });

  it('無扣分、照建議售價的購物為 85', () => {
    expect(BASE_SATISFACTION).toBe(85);
    expect(checkoutSatisfaction([at(100), at(100)], 0)).toBe(85);
  });

  it('售價不低於建議售價時沒有折扣加分', () => {
    expect(discountBonus(100, 100)).toBe(0);
    expect(discountBonus(120, 100)).toBe(0);
    expect(checkoutSatisfaction([at(120)], 0)).toBe(85);
  });

  it('折扣越深加分越多', () => {
    expect(discountBonus(90, 100)).toBeGreaterThan(0);
    expect(discountBonus(80, 100)).toBeGreaterThan(discountBonus(90, 100));
    expect(discountBonus(70, 100)).toBeGreaterThan(discountBonus(80, 100));
  });

  it('每件折扣商品都有貢獻：全面降價高於只降一項', () => {
    const one = checkoutSatisfaction([at(90), at(100)], 0);
    const all = checkoutSatisfaction([at(90), at(90)], 0);
    expect(one).toBeGreaterThan(85);
    expect(all).toBeGreaterThan(one);
  });

  it('整次購物的折扣加分上限 15', () => {
    expect(MAX_DISCOUNT_BONUS).toBe(15);
    expect(checkoutSatisfaction([at(10), at(10), at(10)], 0)).toBe(100);
    expect(checkoutSatisfaction([at(10), at(10), at(10)], 20)).toBe(80);
  });

  it('與扣分組合後限制在 0–100', () => {
    expect(checkoutSatisfaction([at(90)], 30)).toBe(85 + discountBonus(90, 100) - 30);
    expect(checkoutSatisfaction([at(100)], 200)).toBe(0);
  });
});
