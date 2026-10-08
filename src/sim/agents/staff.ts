import type { Batch } from '../inventory/batch';
import type { GridPoint } from '../store/layout';
import type { Passable } from '../pathfinding/grid';
import { chooseRestockTask, slotKey } from './restock';
import type { RestockCandidate } from './restock';
import { Walker } from './walker';

/** 店員每步移動的格數（1x 下約每秒 2.5 格） */
export const STAFF_SPEED = 0.25;
/** 在倉庫取貨所需步數 */
export const PICK_STEPS = 5;
/** 上架所需步數 */
export const STOCK_STEPS = 10;

export type StaffActivity = 'idle' | 'to-backroom' | 'picking' | 'to-slot' | 'stocking' | 'to-register' | 'cashier';

/** 店員在營業時段中需要的外部能力，由 Game 提供 */
export interface StaffWorld {
  readonly backroomDoor: GridPoint;
  readonly isWalkable: Passable;
  restockCandidates(): RestockCandidate[];
  slotAccessTile(fixtureId: string, slotIndex: number): GridPoint;
  takeFromBackroom(productId: string, qty: number): Batch[];
  putIntoSlot(fixtureId: string, slotIndex: number, batches: readonly Batch[]): void;
}

/** 營業時段中，一位店員的位置與工作狀態 */
export class StaffAgent extends Walker {
  activity: StaffActivity = 'idle';
  task: RestockCandidate | null = null;
  carrying: Batch[] = [];
  /** 收銀中或前往收銀的收銀台 */
  registerId: string | null = null;
  private timer = 0;

  constructor(id: string, start: GridPoint) {
    super(id, start, STAFF_SPEED);
  }

  /** 沒拿著貨時可以被叫去收銀（會放棄尚未取貨的補貨工作） */
  get availableForRegister(): boolean {
    return this.registerId === null && this.carrying.length === 0 && this.activity !== 'stocking';
  }

  /** 指派去收銀台的店員側取用格 */
  assignRegister(registerId: string, staffTile: GridPoint, world: StaffWorld, reserved: Set<string>): void {
    this.dropTask(reserved);
    this.registerId = registerId;
    this.activity = 'to-register';
    this.walkTo(staffTile, world.isWalkable);
  }

  /** 收銀台沒人排隊時解除收銀，回去補貨 */
  releaseRegister(): void {
    this.registerId = null;
    this.activity = 'idle';
  }

  /** 推進一步；reserved 為所有店員已認領的格位 */
  update(world: StaffWorld, reserved: Set<string>): void {
    this.beginStep();

    switch (this.activity) {
      case 'idle': {
        const task = chooseRestockTask(world.restockCandidates(), reserved);
        if (!task) return;
        this.task = task;
        reserved.add(slotKey(task.fixtureId, task.slotIndex));
        this.activity = 'to-backroom';
        this.walkTo(world.backroomDoor, world.isWalkable);
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
        if (this.carrying.length === 0) return this.dropTask(reserved);
        this.activity = 'to-slot';
        this.walkTo(world.slotAccessTile(t.fixtureId, t.slotIndex), world.isWalkable);
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
        this.dropTask(reserved);
        return;
      case 'to-register':
        if (this.move()) this.activity = 'cashier';
        return;
      case 'cashier':
        return;
    }
  }

  private dropTask(reserved: Set<string>): void {
    if (this.task) reserved.delete(slotKey(this.task.fixtureId, this.task.slotIndex));
    this.task = null;
    this.activity = 'idle';
  }
}
