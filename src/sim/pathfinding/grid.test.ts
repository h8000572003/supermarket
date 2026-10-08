import { describe, expect, it } from 'vitest';
import type { GridPoint } from '../store/layout';
import { findPath, isReachable, reachableFrom } from './grid';

// 5×5 網格，x = 2 是一道牆，只在 y = 4 留缺口
const passable = (p: GridPoint) => p.x >= 0 && p.x < 5 && p.y >= 0 && p.y < 5 && !(p.x === 2 && p.y < 4);

describe('網格尋路', () => {
  it('繞過牆找到最短路徑', () => {
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, passable);
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path).toHaveLength(13); // 下 4、右 4、上 4，加起點
  });

  it('被完全隔開時回傳 null', () => {
    const walled = (p: GridPoint) => passable(p) && !(p.x === 2 && p.y === 4);
    expect(findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, walled)).toBeNull();
  });

  it('起點不可走時不可達任何格', () => {
    expect(reachableFrom({ x: 2, y: 0 }, passable).size).toBe(0);
  });

  it('可達集合涵蓋缺口另一側', () => {
    expect(isReachable(reachableFrom({ x: 0, y: 0 }, passable), { x: 4, y: 0 })).toBe(true);
  });
});
