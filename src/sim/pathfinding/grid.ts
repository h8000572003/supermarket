import type { GridPoint } from '../store/layout';

export type Passable = (p: GridPoint) => boolean;

const NEIGHBORS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const key = (p: GridPoint) => `${p.x},${p.y}`;

/** 從 start 出發、四方向可走到的所有格子（含 start；start 不可走時為空） */
export function reachableFrom(start: GridPoint, passable: Passable): Set<string> {
  const seen = new Set<string>();
  if (!passable(start)) return seen;
  seen.add(key(start));
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as GridPoint;
    for (const d of NEIGHBORS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (seen.has(key(next)) || !passable(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

export function isReachable(reachable: Set<string>, p: GridPoint): boolean {
  return reachable.has(key(p));
}

/**
 * 四方向最短路徑（均一成本網格，BFS 即最短）。
 * 回傳含起點與終點的格子序列；無路可走時回傳 null。
 */
export function findPath(start: GridPoint, goal: GridPoint, passable: Passable): GridPoint[] | null {
  if (!passable(start) || !passable(goal)) return null;
  const cameFrom = new Map<string, GridPoint | null>([[key(start), null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as GridPoint;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: GridPoint[] = [];
      for (let p: GridPoint | null | undefined = cur; p; p = cameFrom.get(key(p))) path.push(p);
      return path.reverse();
    }
    for (const d of NEIGHBORS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (cameFrom.has(key(next)) || !passable(next)) continue;
      cameFrom.set(key(next), cur);
      queue.push(next);
    }
  }
  return null;
}
