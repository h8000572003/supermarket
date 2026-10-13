import { FIXTURES } from '../sim/catalog/fixtures';
import { footprint, footprintTiles } from '../sim/store/geometry';
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
