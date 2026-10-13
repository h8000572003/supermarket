import { describe, expect, it } from 'vitest';
import { itemsToDraw, slotLevel } from './stock-visuals';

describe('陳列庫存的畫面', () => {
  it('依陳列庫存判斷空、偏低（低於補貨門檻）、有貨、滿', () => {
    expect(slotLevel(0, 12)).toBe('empty');
    expect(slotLevel(3, 12)).toBe('low');
    expect(slotLevel(6, 12)).toBe('ok');
    expect(slotLevel(12, 12)).toBe('full');
  });

  it('空的不畫、有貨至少畫 1 件、只有滿才畫滿一排', () => {
    expect(itemsToDraw(0, 10)).toBe(0);
    expect(itemsToDraw(1, 10)).toBe(1);
    const full = itemsToDraw(10, 10);
    expect(itemsToDraw(9, 10)).toBeLessThan(full);
    expect(itemsToDraw(5, 10)).toBeGreaterThan(itemsToDraw(1, 10));
  });
});
