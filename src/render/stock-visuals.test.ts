import { describe, expect, it } from 'vitest';
import { goodsPerLevel, slotLevel, tileStock } from './stock-visuals';

describe('陳列庫存的畫面', () => {
  it('依陳列庫存判斷格位空、偏低（低於補貨門檻）、有貨、滿', () => {
    expect(slotLevel(0, 12)).toBe('empty');
    expect(slotLevel(3, 12)).toBe('low');
    expect(slotLevel(6, 12)).toBe('ok');
    expect(slotLevel(12, 12)).toBe('full');
  });

  it('一格陳列櫃全空才算空、全滿才算滿，其餘為有貨', () => {
    expect(tileStock(['empty', 'empty'])).toBe('empty');
    expect(tileStock(['full', 'full'])).toBe('full');
    expect(tileStock(['empty', 'full'])).toBe('stocked');
    expect(tileStock(['low', 'ok'])).toBe('stocked');
  });

  it('空的不畫商品，有貨畫一半，滿的畫滿', () => {
    expect(goodsPerLevel('empty')).toBe(0);
    expect(goodsPerLevel('stocked')).toBeGreaterThan(0);
    expect(goodsPerLevel('stocked')).toBeLessThan(goodsPerLevel('full'));
  });
});
