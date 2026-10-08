import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import type { Game } from './game';

/** 營業時段跑完，停在每日結算 */
export function runOpenHours(game: Game): void {
  const r = game.openStore();
  if (!r.ok) throw new Error(r.error);
  while (game.phase === 'open') game.tick((STEP_MS * MAX_STEPS_PER_TICK) / game.speed);
}

/** 跑完整個營業日，進入下一天的準備階段 */
export function playThroughDay(game: Game): void {
  runOpenHours(game);
  const r = game.startNextDay();
  if (!r.ok) throw new Error(r.error);
}
