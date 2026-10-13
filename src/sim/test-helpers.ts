import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import type { Game } from './game';
import type { PendingIncident } from './incidents/incidents';

/** 遇到狀況時選哪個選項（回傳選項索引） */
export type IncidentChooser = (incident: PendingIncident, game: Game) => number;

/** 預設：第一個付得起的選項 */
export const firstAvailableOption: IncidentChooser = (incident) => incident.options.findIndex((o) => o.available);

/** 營業時段跑完，停在每日結算；途中發生的狀況以 choose 處理 */
export function runOpenHours(game: Game, choose: IncidentChooser = firstAvailableOption): void {
  const r = game.openStore();
  if (!r.ok) throw new Error(r.error);
  while (game.phase === 'open') {
    const incident = game.pendingIncident;
    if (incident) {
      // 選擇被拒絕時直接拋錯，不會卡在等待選擇
      const resolved = game.resolveIncident(choose(incident, game));
      if (!resolved.ok) throw new Error(`${incident.kind}: ${resolved.error}`);
      continue;
    }
    // 暫停（倍速 0）時 tick 不會推進，直接拋錯而不是卡住
    if (game.speed === 0) throw new Error('runOpenHours: 倍速為 0');
    game.tick((STEP_MS * MAX_STEPS_PER_TICK) / game.speed);
  }
}

/** 推進一次 tick；若有狀況等待選擇，先以 choose 處理（逐步推進營業時段的測試用，避免卡在等待選擇） */
export function tickResolving(game: Game, realDtMs: number, choose: IncidentChooser = firstAvailableOption): void {
  const incident = game.pendingIncident;
  if (incident) {
    const resolved = game.resolveIncident(choose(incident, game));
    if (!resolved.ok) throw new Error(`${incident.kind}: ${resolved.error}`);
  }
  game.tick(realDtMs);
}

/** 跑完整個營業日，進入下一天的準備階段 */
export function playThroughDay(game: Game): void {
  runOpenHours(game);
  const r = game.startNextDay();
  if (!r.ok) throw new Error(r.error);
}
