import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { arrivalsPerHour, purchaseProbability, rollShoppingList } from './demand';

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
