import { useSyncExternalStore } from 'react';
import type { Game } from '../sim/game';
import type { Interaction, InteractionState } from './interaction';

/** Game 狀態改變時重新渲染；回傳 version 僅作為依賴 */
export function useGameVersion(game: Game): number {
  return useSyncExternalStore(
    (l) => game.subscribe(l),
    () => game.version,
  );
}

export function useInteraction(interaction: Interaction): InteractionState {
  return useSyncExternalStore(
    (l) => interaction.subscribe(l),
    () => interaction.state,
  );
}
