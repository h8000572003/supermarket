import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import {
  BASE_SATISFACTION,
  MAX_DISCOUNT_BONUS,
  arrivalsPerHour,
  checkoutSatisfaction,
  discountBonus,
  purchaseProbability,
  rollShoppingList,
} from './demand';

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
