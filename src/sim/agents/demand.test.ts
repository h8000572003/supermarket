import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import type { CategoryId } from '../catalog/products';
import {
  BASE_SATISFACTION,
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
import type { DemandMultipliers } from './demand';

describe('來客曲線', () => {
  it('午餐尖峰高於下午離峰，深夜最低', () => {
    expect(arrivalsPerHour(12 * 60 + 30)).toBeGreaterThan(arrivalsPerHour(15 * 60) * 2);
    expect(arrivalsPerHour(22 * 60)).toBeLessThan(arrivalsPerHour(8 * 60));
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
