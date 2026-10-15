import { FIXTURES } from '../sim/catalog/fixtures';
import { footprint, footprintTiles } from '../sim/store/geometry';
import type { NuisanceKind } from '../sim/nuisances/nuisances';
import type { Fixture } from '../sim/store/store-layout';
import { ART_HEIGHT } from './fixture-art';
import { TILE_HEIGHT, TILE_WIDTH, gridToScreen } from './iso';
import type { ScreenPoint } from './iso';

/** 點在某一格往上長高 height 的柱體輪廓內（場景座標） */
export function inTilePrism(p: ScreenPoint, tile: { x: number; y: number }, height: number): boolean {
  const top = gridToScreen(tile.x, tile.y);
  const dx = Math.abs(p.x - top.x);
  if (dx > TILE_WIDTH / 2) return false;
  const slope = (dx * TILE_HEIGHT) / TILE_WIDTH;
  return p.y >= top.y + slope - height && p.y <= top.y + TILE_HEIGHT - slope;
}

/** 依畫出來的設施圖找出點到的設施；重疊時取最前面（離鏡頭最近）的 */
export function pickFixture(fixtures: readonly Fixture[], p: ScreenPoint): Fixture | undefined {
  let best: Fixture | undefined;
  let bestDepth = -Infinity;
  for (const f of fixtures) {
    for (const tile of footprintTiles(footprint(FIXTURES[f.kind], f))) {
      const depth = tile.x + tile.y;
      if (depth > bestDepth && inTilePrism(p, tile, ART_HEIGHT[f.kind])) {
        best = f;
        bestDepth = depth;
      }
    }
  }
  return best;
}

/** 麻煩頭上圖示中心在所在格中心上方的高度（場景座標） */
export const NUISANCE_ICON_HEIGHT: Readonly<Record<NuisanceKind, number>> = {
  litter: 20,
};

/** 點擊判定的半徑：點在麻煩本身或頭上圖示附近都算點到 */
export const NUISANCE_HIT_RADIUS = 14;

/** 可點擊的麻煩：種類與網格位置（可帶小數） */
export interface PickableNuisance {
  readonly id: string;
  readonly kind: NuisanceKind;
  readonly pos: { readonly x: number; readonly y: number };
}

/** 依畫出來的麻煩（本身與頭上圖示）找出點到的麻煩；重疊時取最前面的 */
export function pickNuisance<T extends PickableNuisance>(nuisances: readonly T[], p: ScreenPoint): T | undefined {
  let best: T | undefined;
  let bestDepth = -Infinity;
  for (const n of nuisances) {
    const origin = gridToScreen(n.pos.x + 0.5, n.pos.y + 0.5);
    const near = (y: number) => Math.hypot(p.x - origin.x, p.y - y) <= NUISANCE_HIT_RADIUS;
    const depth = n.pos.x + n.pos.y;
    if (depth > bestDepth && (near(origin.y) || near(origin.y - NUISANCE_ICON_HEIGHT[n.kind]))) {
      best = n;
      bestDepth = depth;
    }
  }
  return best;
}
