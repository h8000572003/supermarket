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
/** 下架（取下格位上全部陳列庫存）所需步數，與上架相當 */
export const CLEAR_OUT_STEPS = STOCK_STEPS;
/** 在倉庫放下退回商品所需步數 */
export const UNLOAD_STEPS = PICK_STEPS;

export type StaffActivity =
  | 'idle'
  | 'to-backroom'
  | 'picking'
  | 'to-slot'
  | 'stocking'
  | 'to-register'
  | 'cashier'
  /** 下架：走向格位、取下陳列庫存、搬回倉庫門、放下 */
  | 'to-clear-out'
  | 'clearing-out'
  | 'returning'
  | 'unloading';

/** 換貨中、等待下架的格位 */
export interface ClearOutCandidate {
  readonly fixtureId: string;
  readonly slotIndex: number;
}

/** 店員目前的工作：補貨（含派工），或換貨的下架 */
export type StaffTask = ({ readonly kind: 'restock' } & RestockCandidate) | ({ readonly kind: 'clear-out' } & ClearOutCandidate);

/** 店員在營業時段中需要的外部能力，由 Game 提供 */
export interface StaffWorld {
  readonly backroomDoor: GridPoint;
  readonly isWalkable: Passable;
  restockCandidates(): RestockCandidate[];
  /** 等待下架的格位（依發起換貨的順序） */
  clearOutCandidates(): ClearOutCandidate[];
  slotAccessTile(fixtureId: string, slotIndex: number): GridPoint;
  takeFromBackroom(productId: string, qty: number): Batch[];
  putIntoSlot(fixtureId: string, slotIndex: number, batches: readonly Batch[]): void;
  /** 下架：取下格位全部陳列庫存，格位同時改成換貨目標；回傳取下的批次 */
  clearOut(fixtureId: string, slotIndex: number): Batch[];
  /** 下架的商品退回倉庫 */
  returnToBackroom(batches: readonly Batch[]): void;
}

/** 營業時段中，一位店員的位置與工作狀態 */
export class StaffAgent extends Walker {
  activity: StaffActivity = 'idle';
  task: StaffTask | null = null;
  carrying: Batch[] = [];
  /** 收銀中或前往收銀的收銀台 */
  registerId: string | null = null;
  /** 目前的補貨工作是否來自派工 */
  onDispatch = false;
  private timer = 0;

  constructor(id: string, start: GridPoint) {
    super(id, start, STAFF_SPEED);
  }

  /** 沒拿著貨時可以被叫去收銀（會放棄尚未取貨的補貨工作與尚未取下的下架） */
  get availableForRegister(): boolean {
    return (
      this.registerId === null &&
      this.carrying.length === 0 &&
      this.activity !== 'stocking' &&
      this.activity !== 'returning' &&
      this.activity !== 'unloading'
    );
  }

  /** 指派去收銀台的店員側取用格 */
  assignRegister(registerId: string, staffTile: GridPoint, world: StaffWorld, reserved: Set<string>): void {
    this.dropTask(reserved);
    this.registerId = registerId;
    this.activity = 'to-register';
    this.walkTo(staffTile, world.isWalkable);
  }

  /** 派工：放下尚未取貨的工作，改去倉庫取貨補滿指定格位 */
  assignDispatch(task: RestockCandidate, world: StaffWorld, reserved: Set<string>): void {
    this.dropTask(reserved);
    this.task = { kind: 'restock', ...task };
    this.onDispatch = true;
    reserved.add(slotKey(task.fixtureId, task.slotIndex));
    this.activity = 'to-backroom';
    this.walkTo(world.backroomDoor, world.isWalkable);
  }

  /** 取消派工：還沒取貨就放下工作；已拿著貨則照常上架 */
  cancelDispatch(reserved: Set<string>): void {
    if (!this.onDispatch) return;
    if (this.carrying.length === 0) this.dropTask(reserved);
    else this.onDispatch = false;
  }

  /** 格位開始換貨：還沒取貨的一般補貨放下（不再補舊商品）；派工與已拿著貨的照常 */
  abandonRestock(fixtureId: string, slotIndex: number, reserved: Set<string>): void {
    const t = this.task;
    if (t?.kind !== 'restock' || t.fixtureId !== fixtureId || t.slotIndex !== slotIndex) return;
    if (this.onDispatch || this.carrying.length > 0) return;
    this.dropTask(reserved);
  }

  /** 收銀台沒人排隊時解除收銀，回去補貨 */
  releaseRegister(): void {
    this.registerId = null;
    this.activity = 'idle';
  }

  /** 提早下班：放下補貨與收銀工作，回傳手上還沒上架的商品（由 Game 退回倉庫） */
  leaveWork(reserved: Set<string>): Batch[] {
    const carrying = this.carrying;
    this.carrying = [];
    this.dropTask(reserved);
    this.registerId = null;
    return carrying;
  }

  /** 推進一步；reserved 為所有店員已認領的格位 */
  update(world: StaffWorld, reserved: Set<string>): void {
    this.beginStep();

    switch (this.activity) {
      case 'idle': {
        // 自己找工作時，下架優先於一般補貨
        const clearOut = world.clearOutCandidates().find((c) => !reserved.has(slotKey(c.fixtureId, c.slotIndex)));
        if (clearOut) {
          this.task = { kind: 'clear-out', fixtureId: clearOut.fixtureId, slotIndex: clearOut.slotIndex };
          reserved.add(slotKey(clearOut.fixtureId, clearOut.slotIndex));
          this.activity = 'to-clear-out';
          this.walkTo(world.slotAccessTile(clearOut.fixtureId, clearOut.slotIndex), world.isWalkable);
          return;
        }
        const task = chooseRestockTask(world.restockCandidates(), reserved);
        if (!task) return;
        this.task = { kind: 'restock', ...task };
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
        if (--this.timer > 0 || this.task?.kind !== 'restock') return;
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
      case 'to-clear-out':
        if (this.move()) {
          this.activity = 'clearing-out';
          this.timer = CLEAR_OUT_STEPS;
        }
        return;
      case 'clearing-out': {
        if (--this.timer > 0 || !this.task) return;
        // 取下的那一刻格位改成新商品、換貨結束；格位不再需要認領，可以照一般補貨上架
        this.carrying = world.clearOut(this.task.fixtureId, this.task.slotIndex);
        this.dropTask(reserved);
        if (this.carrying.length === 0) return;
        this.activity = 'returning';
        this.walkTo(world.backroomDoor, world.isWalkable);
        return;
      }
      case 'returning':
        if (this.move()) {
          this.activity = 'unloading';
          this.timer = UNLOAD_STEPS;
        }
        return;
      case 'unloading':
        if (--this.timer > 0) return;
        world.returnToBackroom(this.carrying);
        this.carrying = [];
        this.activity = 'idle';
        return;
    }
  }

  private dropTask(reserved: Set<string>): void {
    if (this.task) reserved.delete(slotKey(this.task.fixtureId, this.task.slotIndex));
    this.task = null;
    this.onDispatch = false;
    this.activity = 'idle';
  }
}
