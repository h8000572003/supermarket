import { describe, expect, it } from 'vitest';
import type { Fixture } from '../sim/store/store-layout';
import { ART_HEIGHT } from './fixture-art';
import { TILE_HEIGHT, gridToScreen } from './iso';
import { NUISANCE_ICON_HEIGHT, inTilePrism, pickFixture, pickNuisance } from './pick';

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

describe('點擊麻煩判定', () => {
  const litter = (id: string, x: number, y: number) => ({ id, kind: 'litter' as const, pos: { x, y } });

  it('點在麻煩所在格的中心或頭上圖示：點到', () => {
    const n = litter('a', 3, 3);
    const center = gridToScreen(3.5, 3.5);
    expect(pickNuisance([n], center)?.id).toBe('a');
    expect(pickNuisance([n], { x: center.x, y: center.y - NUISANCE_ICON_HEIGHT.litter })?.id).toBe('a');
  });

  it('點在別的格子：沒點到', () => {
    expect(pickNuisance([litter('a', 3, 3)], gridToScreen(6.5, 6.5))).toBeUndefined();
  });

  it('重疊時選前面的', () => {
    const back = litter('back', 3, 3);
    const front = litter('front', 3.3, 3.3);
    expect(pickNuisance([front, back], gridToScreen(3.65, 3.65))?.id).toBe('front');
  });
});
