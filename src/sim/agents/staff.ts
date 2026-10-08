import { findPath } from '../pathfinding/grid';
import type { Batch } from '../inventory/batch';
import type { GridPoint } from '../store/layout';
import { chooseRestockTask, slotKey } from './restock';
import type { RestockCandidate } from './restock';

/** 店員每步移動的格數（1x 下約每秒 2.5 格） */
export const STAFF_SPEED = 0.25;
/** 在倉庫取貨所需步數 */
export const PICK_STEPS = 5;
/** 上架所需步數 */
export const STOCK_STEPS = 10;

export type StaffActivity = 'idle' | 'to-backroom' | 'picking' | 'to-slot' | 'stocking';

/** 店員在營業時段中需要的外部能力，由 Game 提供 */
export interface StaffWorld {
  readonly backroomDoor: GridPoint;
  isWalkable(p: GridPoint): boolean;
  restockCandidates(): RestockCandidate[];
  slotAccessTile(fixtureId: string, slotIndex: number): GridPoint;
  takeFromBackroom(productId: string, qty: number): Batch[];
  putIntoSlot(fixtureId: string, slotIndex: number, batches: readonly Batch[]): void;
}

interface Point {
  x: number;
  y: number;
}

/** 營業時段中，一位店員的位置與工作狀態 */
export class StaffAgent {
  activity: StaffActivity = 'idle';
  /** 目前位置（網格座標，整數為格子中心） */
  readonly pos: Point;
  /** 上一步的位置，供畫面內插 */
  readonly prev: Point;
  task: RestockCandidate | null = null;
  carrying: Batch[] = [];
  private path: GridPoint[] = [];
  private timer = 0;

  constructor(
    readonly id: string,
    start: GridPoint,
  ) {
    this.pos = { x: start.x, y: start.y };
    this.prev = { x: start.x, y: start.y };
  }

  /** 推進一步；reserved 為所有店員已認領的格位 */
  update(world: StaffWorld, reserved: Set<string>): void {
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;

    switch (this.activity) {
      case 'idle': {
        const task = chooseRestockTask(world.restockCandidates(), reserved);
        if (!task) return;
        this.task = task;
        reserved.add(slotKey(task.fixtureId, task.slotIndex));
        this.walkTo(world, world.backroomDoor, 'to-backroom');
        return;
      }
      case 'to-backroom':
        if (this.move()) {
          this.activity = 'picking';
          this.timer = PICK_STEPS;
        }
        return;
      case 'picking': {
        if (--this.timer > 0 || !this.task) return;
        const t = this.task;
        this.carrying = world.takeFromBackroom(t.productId, t.capacity - t.qty);
        if (this.carrying.length === 0) return this.finish(reserved);
        this.walkTo(world, world.slotAccessTile(t.fixtureId, t.slotIndex), 'to-slot');
        return;
      }
      case 'to-slot':
        if (this.move()) {
          this.activity = 'stocking';
          this.timer = STOCK_STEPS;
        }
        return;
      case 'stocking':
        if (--this.timer > 0 || !this.task) return;
        world.putIntoSlot(this.task.fixtureId, this.task.slotIndex, this.carrying);
        this.carrying = [];
        this.finish(reserved);
        return;
    }
  }

  private walkTo(world: StaffWorld, goal: GridPoint, activity: StaffActivity): void {
    const here = { x: Math.round(this.pos.x), y: Math.round(this.pos.y) };
    this.path = findPath(here, goal, (p) => world.isWalkable(p))?.slice(1) ?? [];
    this.activity = activity;
  }

  /** 沿路徑前進；抵達終點時回傳 true */
  private move(): boolean {
    let budget = STAFF_SPEED;
    while (budget > 0) {
      const next = this.path[0];
      if (!next) return true;
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

  private finish(reserved: Set<string>): void {
    if (this.task) reserved.delete(slotKey(this.task.fixtureId, this.task.slotIndex));
    this.task = null;
    this.activity = 'idle';
  }
}
