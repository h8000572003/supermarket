import { describe, expect, it } from 'vitest';
import { itemsOnLevel, slotLevel } from './stock-visuals';

describe('陳列庫存的畫面', () => {
  it('依陳列庫存判斷格位空、偏低（低於補貨門檻）、有貨、滿', () => {
    expect(slotLevel(0, 12)).toBe('empty');
    expect(slotLevel(3, 12)).toBe('low');
    expect(slotLevel(6, 12)).toBe('ok');
    expect(slotLevel(12, 12)).toBe('full');
  });

  it('空的不畫商品，偏低、有貨、滿依序畫越多件', () => {
    expect(itemsOnLevel('empty')).toBe(0);
    expect(itemsOnLevel('low')).toBeGreaterThan(0);
    expect(itemsOnLevel('ok')).toBeGreaterThan(itemsOnLevel('low'));
    expect(itemsOnLevel('full')).toBeGreaterThan(itemsOnLevel('ok'));
  });
});
