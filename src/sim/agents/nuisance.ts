import type { NuisanceKind } from '../nuisances/nuisances';
import type { GridPoint } from '../store/layout';
import { Walker } from './walker';

/** 營業時段中，店內的一個麻煩（垃圾、老鼠、奧客）的位置與狀態 */
export class NuisanceAgent extends Walker {
  /** 店員已走到旁邊、正在處理；處理中不再移動 */
  beingHandled = false;

  constructor(
    id: string,
    readonly kind: NuisanceKind,
    start: GridPoint,
    /** 出現時的步數 */
    readonly appearedStep: number,
    speed = 0,
  ) {
    super(id, start, speed);
  }

  /** 推進一步 */
  update(): void {
    this.beginStep();
  }
}
