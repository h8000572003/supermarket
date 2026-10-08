import type { GridPoint } from '../sim/store/layout';

/** 等角圖塊在螢幕上的寬與高（2:1 菱形） */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** 網格座標 → 場景座標；回傳的是該格菱形的頂點（上角） */
export function gridToScreen(x: number, y: number): ScreenPoint {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  };
}

/** 場景座標 → 所在的網格（不檢查是否在店內） */
export function screenToGrid(sx: number, sy: number): GridPoint {
  const a = sx / (TILE_WIDTH / 2);
  const b = sy / (TILE_HEIGHT / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** 一格菱形的四個頂點（上、右、下、左），供 Graphics.poly 使用 */
export function tileDiamond(x: number, y: number): number[] {
  const top = gridToScreen(x, y);
  const right = gridToScreen(x + 1, y);
  const bottom = gridToScreen(x + 1, y + 1);
  const left = gridToScreen(x, y + 1);
  return [top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y];
}
