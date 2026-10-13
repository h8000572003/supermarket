import { describe, expect, it } from 'vitest';
import type { Fixture } from '../sim/store/store-layout';
import { ART_HEIGHT } from './fixture-art';
import { TILE_HEIGHT, gridToScreen } from './iso';
import { inTilePrism, pickFixture } from './pick';

const shelf = (id: string, x: number, y: number): Fixture => ({ id, kind: 'shelf', origin: { x, y }, facing: 'south' });

describe('點擊設施判定', () => {
  it('點在格子中心：在柱體內', () => {
    expect(inTilePrism(gridToScreen(3.5, 3.5), { x: 3, y: 3 }, 0)).toBe(true);
  });

  it('點在格子正上方、高度以內：在柱體內；超過高度：不在', () => {
    const top = gridToScreen(3, 3);
    expect(inTilePrism({ x: top.x, y: top.y - 40 }, { x: 3, y: 3 }, 50)).toBe(true);
    expect(inTilePrism({ x: top.x, y: top.y - 60 }, { x: 3, y: 3 }, 50)).toBe(false);
  });

  it('點到設施圖的上半部（地板上是後面的格子）也選到該設施', () => {
    const f = shelf('a', 4, 4);
    const top = gridToScreen(4, 4);
    const p = { x: top.x, y: top.y - ART_HEIGHT.shelf + 4 };
    expect(pickFixture([f], p)?.id).toBe('a');
  });

  it('前後兩個設施重疊時選前面的', () => {
    const back = shelf('back', 4, 4);
    const front = shelf('front', 5, 5);
    // 前面設施的頂部附近，同時落在後面設施的柱體內
    const top = gridToScreen(5, 5);
    const p = { x: top.x, y: top.y + TILE_HEIGHT / 2 - 30 };
    expect(pickFixture([back, front], p)?.id).toBe('front');
    expect(pickFixture([front, back], p)?.id).toBe('front');
  });

  it('點在空地板：沒有選到設施', () => {
    expect(pickFixture([shelf('a', 4, 4)], gridToScreen(9.5, 9.5))).toBeUndefined();
  });
});
