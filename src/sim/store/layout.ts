export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** 店面網格寬（x 方向格數） */
export const STORE_WIDTH = 12;
/** 店面網格深（y 方向格數）；y = STORE_DEPTH - 1 為底邊 */
export const STORE_DEPTH = 10;

/** 入口：店面底邊中央 */
export const ENTRANCE: GridPoint = { x: Math.floor(STORE_WIDTH / 2), y: STORE_DEPTH - 1 };

export function isInsideStore(p: GridPoint): boolean {
  return p.x >= 0 && p.x < STORE_WIDTH && p.y >= 0 && p.y < STORE_DEPTH;
}
