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
}

/** 店長操作的暫態（不屬於模擬狀態，不存檔） */
export class Interaction {
  private _state: InteractionState = { tool: { mode: 'select' }, selectedId: null, hover: null, message: null };
  private readonly listeners = new Set<() => void>();

  get state(): InteractionState {
    return this._state;
  }

  update(patch: Partial<InteractionState>): void {
    this._state = { ...this._state, ...patch };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
