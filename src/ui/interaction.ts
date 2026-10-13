import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Facing } from '../sim/store/geometry';
import type { GridPoint } from '../sim/store/layout';

export type Tool =
  | { readonly mode: 'select' }
  /** movingId 存在時表示正在移動既有設施 */
  | { readonly mode: 'place'; readonly kind: FixtureKind; readonly facing: Facing; readonly movingId?: string };

export interface InteractionState {
  readonly tool: Tool;
  readonly selectedId: string | null;
  readonly hover: GridPoint | null;
  readonly message: string | null;
  /** 錯誤訊息以紅色顯示；一般提示（如限時特價結束）以中性色顯示 */
  readonly messageKind: 'error' | 'info';
  /** 每次設定新訊息就遞增；同一句話再出現一次也會重新計時自動消失 */
  readonly messageSeq: number;
}

/** 店長操作的暫態（不屬於模擬狀態，不存檔） */
export class Interaction {
  private _state: InteractionState = {
    tool: { mode: 'select' },
    selectedId: null,
    hover: null,
    message: null,
    messageKind: 'error',
    messageSeq: 0,
  };
  private readonly listeners = new Set<() => void>();

  get state(): InteractionState {
    return this._state;
  }

  update(patch: Partial<Omit<InteractionState, 'messageSeq'>>): void {
    const next = { ...this._state, ...patch };
    if (patch.message) {
      next.messageSeq = this._state.messageSeq + 1;
      next.messageKind = patch.messageKind ?? 'error';
    }
    this._state = next;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
