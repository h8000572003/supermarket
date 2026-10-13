import type { GridPoint } from '../store/layout';
import type { CustomerAgent, CustomerWorld } from './customer';
import type { StaffAgent, StaffWorld } from './staff';

/** 結帳的基本步數與每件商品的額外步數 */
export const SERVICE_BASE_STEPS = 6;
export const SERVICE_STEPS_PER_ITEM = 2;
/** 隊伍清空後，收銀店員再等這麼多步才回去補貨 */
export const CASHIER_RELEASE_STEPS = 20;

export interface RegisterSpot {
  readonly id: string;
  /** 顧客側取用格（結帳位置） */
  readonly customerTile: GridPoint;
  /** 店員側取用格 */
  readonly staffTile: GridPoint;
  /** 隊伍往後延伸的方向（正面朝向） */
  readonly queueDir: GridPoint;
}

interface RegisterState {
  readonly spot: RegisterSpot;
  readonly queue: CustomerAgent[];
  cashier: StaffAgent | null;
  serving: { customer: CustomerAgent; timer: number } | null;
  idleSteps: number;
}

/** 營業時段中各收銀台的隊伍、收銀店員與結帳進度 */
export class Checkout {
  private readonly registers: RegisterState[];

  constructor(
    spots: readonly RegisterSpot[],
    private readonly isWalkable: (p: GridPoint) => boolean,
  ) {
    this.registers = spots.map((spot) => ({ spot, queue: [], cashier: null, serving: null, idleSteps: 0 }));
  }

  /** 加入最短的隊伍（有收銀店員的優先）；沒有收銀台時回傳 false */
  join(customer: CustomerAgent): boolean {
    let best: RegisterState | null = null;
    let bestScore = Infinity;
    for (const r of this.registers) {
      const score = r.queue.length + (r.cashier ? 0 : 0.5);
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
    }
    if (!best) return false;
    best.queue.push(customer);
    return true;
  }

  leave(customer: CustomerAgent): void {
    for (const r of this.registers) {
      const i = r.queue.indexOf(customer);
      if (i !== -1) r.queue.splice(i, 1);
    }
  }

  /** 隊伍第 i 位站在結帳位置往後第 i 格；遇到障礙就停在最後一個可站的格子 */
  queueTile(customer: CustomerAgent): GridPoint | null {
    for (const r of this.registers) {
      const index = r.queue.indexOf(customer);
      if (index === -1) continue;
      let tile = r.spot.customerTile;
      for (let i = 1; i <= index; i++) {
        const next = { x: tile.x + r.spot.queueDir.x, y: tile.y + r.spot.queueDir.y };
        if (!this.isWalkable(next)) break;
        tile = next;
      }
      return tile;
    }
    return null;
  }

  queueLength(registerId: string): number {
    return this.registers.find((r) => r.spot.id === registerId)?.queue.length ?? 0;
  }

  /**
   * 推進一步：替有人排隊的收銀台叫店員、結帳；再替派工的收銀台（held）叫店員待命。
   * held 中的收銀台不會解除收銀。onSale 在每位顧客結帳完成時呼叫。
   */
  update(
    staff: readonly StaffAgent[],
    staffWorld: StaffWorld,
    reservedSlots: Set<string>,
    customerWorld: CustomerWorld,
    onSale: (customer: CustomerAgent) => void,
    held: ReadonlySet<string> = new Set(),
  ): void {
    for (const r of this.registers) {
      if (r.queue.length > 0 && !r.cashier) {
        const cashier = nearestAvailable(staff, r.spot.staffTile);
        if (cashier) {
          cashier.assignRegister(r.spot.id, r.spot.staffTile, staffWorld, reservedSlots);
          r.cashier = cashier;
        }
      }

      const atCounter = r.cashier?.activity === 'cashier';
      const head = r.queue[0];
      if (atCounter && !r.serving && head?.atQueueSpot) {
        head.activity = 'paying';
        r.serving = { customer: head, timer: SERVICE_BASE_STEPS + SERVICE_STEPS_PER_ITEM * head.basket.length };
      }

      if (r.serving && --r.serving.timer <= 0) {
        const { customer } = r.serving;
        r.serving = null;
        r.queue.shift();
        onSale(customer);
        customer.paid(customerWorld);
      }

      if (r.cashier && r.queue.length === 0 && !held.has(r.spot.id)) {
        if (++r.idleSteps >= CASHIER_RELEASE_STEPS) {
          r.cashier.releaseRegister();
          r.cashier = null;
          r.idleSteps = 0;
        }
      } else {
        r.idleSteps = 0;
      }
    }

    // 派工的收銀台優先序低於有人排隊的收銀台；不搶正在處理格位派工的店員
    for (const r of this.registers) {
      if (!held.has(r.spot.id) || r.cashier) continue;
      const cashier = nearestAvailable(staff, r.spot.staffTile, (s) => !s.onDispatch);
      if (cashier) {
        cashier.assignRegister(r.spot.id, r.spot.staffTile, staffWorld, reservedSlots);
        r.cashier = cashier;
      }
    }
  }

  /** 店員已站在收銀台、且沒有人排隊 */
  isStaffedAndClear(registerId: string): boolean {
    const r = this.registers.find((x) => x.spot.id === registerId);
    return r?.cashier?.activity === 'cashier' && r.queue.length === 0;
  }
}

/** 最近有空（沒拿著貨、不在收銀）的店員 */
export function nearestAvailable(
  staff: readonly StaffAgent[],
  tile: GridPoint,
  accept: (s: StaffAgent) => boolean = () => true,
): StaffAgent | null {
  let best: StaffAgent | null = null;
  let bestDist = Infinity;
  for (const s of staff) {
    if (!s.availableForRegister || !accept(s)) continue;
    const d = Math.abs(s.pos.x - tile.x) + Math.abs(s.pos.y - tile.y);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
