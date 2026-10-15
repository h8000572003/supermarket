import { NUISANCES } from '../nuisances/nuisances';
import type { NuisanceKind } from '../nuisances/nuisances';
import type { Passable } from '../pathfinding/grid';
import type { Rng } from '../rng';
import { STORE_DEPTH, STORE_WIDTH } from '../store/layout';
import type { GridPoint } from '../store/layout';
import { Walker } from './walker';

/** 會移動的麻煩走到目的地後停留的步數範圍 */
const PAUSE_MIN_STEPS = 6;
const PAUSE_MAX_STEPS = 25;

/** 麻煩在營業時段中需要的外部能力，由 Game 提供 */
export interface NuisanceWorld {
  readonly entrance: GridPoint;
  readonly isWalkable: Passable;
  readonly rng: Rng;
}

/** 營業時段中，店內的一個麻煩（垃圾、老鼠、奧客）的位置與狀態 */
export class NuisanceAgent extends Walker {
  /** 店員已走到旁邊、正在處理；處理中不再移動 */
  beingHandled = false;
  /** 正在走向入口離店（奧客）：不再算在場，也不能派工；到入口後消失 */
  leaving = false;
  /** 已走出店外，可以移除 */
  gone = false;
  private pause = 0;
  private walking = false;

  constructor(
    id: string,
    readonly kind: NuisanceKind,
    start: GridPoint,
    /** 出現時的步數 */
    readonly appearedStep: number,
  ) {
    super(id, start, NUISANCES[kind].speed);
  }

  /** 開始走向入口離店 */
  leave(world: NuisanceWorld): void {
    this.leaving = true;
    this.beingHandled = false;
    this.walkTo(world.entrance, world.isWalkable);
  }

  /** 推進一步：會移動的麻煩在店內隨意走動、停留；離店中的走向入口 */
  update(world: NuisanceWorld): void {
    this.beginStep();
    if (this.leaving) {
      if (this.move()) this.gone = true;
      return;
    }
    if (NUISANCES[this.kind].speed === 0 || this.beingHandled) return;
    if (this.walking) {
      if (!this.move()) return;
      this.walking = false;
      this.pause = world.rng.int(PAUSE_MIN_STEPS, PAUSE_MAX_STEPS);
      return;
    }
    if (--this.pause > 0) return;
    const goal = { x: world.rng.int(0, STORE_WIDTH - 1), y: world.rng.int(0, STORE_DEPTH - 1) };
    // 選到不可走或走不到的格子就下一步再選
    if (world.isWalkable(goal) && this.walkTo(goal, world.isWalkable)) this.walking = true;
  }
}
