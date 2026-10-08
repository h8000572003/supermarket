import type { FixtureDef } from '../catalog/fixtures';
import type { GridPoint } from './layout';

/** 正面朝向：north = y−1、east = x+1、south = y+1、west = x−1 */
export type Facing = 'north' | 'east' | 'south' | 'west';

export const FACINGS: readonly Facing[] = ['north', 'east', 'south', 'west'];

const STEP: Record<Facing, GridPoint> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export function rotateClockwise(f: Facing): Facing {
  return FACINGS[(FACINGS.indexOf(f) + 1) % 4] as Facing;
}

function opposite(f: Facing): Facing {
  return FACINGS[(FACINGS.indexOf(f) + 2) % 4] as Facing;
}

export interface Placement {
  readonly origin: GridPoint;
  readonly facing: Facing;
}

export interface Footprint {
  /** 左上角（x、y 最小的格） */
  readonly origin: GridPoint;
  readonly spanX: number;
  readonly spanY: number;
}

export function footprint(def: FixtureDef, { origin, facing }: Placement): Footprint {
  const facesY = facing === 'north' || facing === 'south';
  return { origin, spanX: facesY ? def.width : def.depth, spanY: facesY ? def.depth : def.width };
}

export function footprintTiles(fp: Footprint): GridPoint[] {
  const tiles: GridPoint[] = [];
  for (let dx = 0; dx < fp.spanX; dx++) {
    for (let dy = 0; dy < fp.spanY; dy++) tiles.push({ x: fp.origin.x + dx, y: fp.origin.y + dy });
  }
  return tiles;
}

/** 緊鄰 footprint 某一側的格子 */
function sideTiles(fp: Footprint, side: Facing): GridPoint[] {
  const step = STEP[side];
  return footprintTiles(fp)
    .map((t) => ({ x: t.x + step.x, y: t.y + step.y }))
    .filter((t) => !inFootprint(fp, t));
}

export function inFootprint(fp: Footprint, p: GridPoint): boolean {
  return p.x >= fp.origin.x && p.x < fp.origin.x + fp.spanX && p.y >= fp.origin.y && p.y < fp.origin.y + fp.spanY;
}

/** 顧客側取用格（正面前方） */
export function customerAccessTiles(def: FixtureDef, placement: Placement): GridPoint[] {
  return sideTiles(footprint(def, placement), placement.facing);
}

/** 店員側取用格（背面）；不需要時為空 */
export function staffAccessTiles(def: FixtureDef, placement: Placement): GridPoint[] {
  return def.staffSide ? sideTiles(footprint(def, placement), opposite(placement.facing)) : [];
}

export function accessTiles(def: FixtureDef, placement: Placement): GridPoint[] {
  return [...customerAccessTiles(def, placement), ...staffAccessTiles(def, placement)];
}

/** 第 slotIndex 個格位對應的顧客側取用格：格位平均分配到正面的每一格 */
export function slotAccessTile(def: FixtureDef, placement: Placement, slotIndex: number): GridPoint {
  const tiles = customerAccessTiles(def, placement);
  return tiles[Math.min(tiles.length - 1, Math.floor((slotIndex * tiles.length) / def.slots))] as GridPoint;
}
