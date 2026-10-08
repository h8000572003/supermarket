import { findPath } from '../pathfinding/grid';
import type { Passable } from '../pathfinding/grid';
import type { GridPoint } from '../store/layout';

export interface Point {
  x: number;
  y: number;
}

/** 在網格上沿路徑移動的人物（店員、顧客共用） */
export class Walker {
  /** 目前位置（網格座標，整數為格子中心） */
  readonly pos: Point;
  /** 上一步的位置，供畫面內插 */
  readonly prev: Point;
  private path: GridPoint[] = [];

  constructor(
    readonly id: string,
    start: GridPoint,
    private readonly speed: number,
  ) {
    this.pos = { x: start.x, y: start.y };
    this.prev = { x: start.x, y: start.y };
  }

  /** 每步開始時呼叫，記下上一步位置 */
  beginStep(): void {
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
  }

  /** 目前所在（最接近）的格子 */
  get tile(): GridPoint {
    return { x: Math.round(this.pos.x), y: Math.round(this.pos.y) };
  }

  /** 規劃到 goal 的路徑；無路可走時回傳 false */
  walkTo(goal: GridPoint, passable: Passable): boolean {
    const here = this.tile;
    const path = findPath(here, goal, passable);
    // 不在格子中心時（走到一半被改道），先回到目前格子中心再出發
    const atCenter = this.pos.x === here.x && this.pos.y === here.y;
    this.path = path ? (atCenter ? path.slice(1) : path) : [];
    return path !== null;
  }

  /** 沿路徑前進；抵達終點時回傳 true */
  move(): boolean {
    let budget = this.speed;
    while (budget > 0) {
      const next = this.path[0];
      if (!next) break;
      const dx = next.x - this.pos.x;
      const dy = next.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.pos.x = next.x;
        this.pos.y = next.y;
        this.path.shift();
        budget -= dist;
      } else {
        this.pos.x += (dx / dist) * budget;
        this.pos.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    return this.path.length === 0;
  }
}
