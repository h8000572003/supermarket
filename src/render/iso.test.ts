import { describe, expect, it } from 'vitest';
import { TILE_HEIGHT, TILE_WIDTH, gridToScreen, screenToGrid } from './iso';

describe('等角座標轉換', () => {
  it('原點對應原點', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('x 增加往右下、y 增加往左下', () => {
    expect(gridToScreen(1, 0)).toEqual({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
    expect(gridToScreen(0, 1)).toEqual({ x: -TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
  });

  it('每格中心點反推回同一格', () => {
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 10; y++) {
        const c = gridToScreen(x + 0.5, y + 0.5);
        expect(screenToGrid(c.x, c.y)).toEqual({ x, y });
      }
    }
  });
});
