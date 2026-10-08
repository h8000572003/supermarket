import { describe, expect, it } from 'vitest';
import { ENTRANCE, STORE_DEPTH, STORE_WIDTH, isInsideStore } from './layout';

describe('店面網格', () => {
  it('是 12×10', () => {
    expect([STORE_WIDTH, STORE_DEPTH]).toEqual([12, 10]);
  });

  it('入口位於店內底邊', () => {
    expect(isInsideStore(ENTRANCE)).toBe(true);
    expect(ENTRANCE.y).toBe(STORE_DEPTH - 1);
  });

  it('邊界外不算店內', () => {
    expect(isInsideStore({ x: -1, y: 0 })).toBe(false);
    expect(isInsideStore({ x: STORE_WIDTH, y: 0 })).toBe(false);
    expect(isInsideStore({ x: 0, y: STORE_DEPTH })).toBe(false);
  });
});
