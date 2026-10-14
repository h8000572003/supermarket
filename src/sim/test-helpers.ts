import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import type { Game } from './game';
import type { IncidentEffect, PendingIncident } from './incidents/incidents';

/** 遇到狀況時選哪個選項（回傳選項索引） */
export type IncidentChooser = (incident: PendingIncident, game: Game) => number;

/** 會改變店內庫存或人手的效果；測試預設避開，讓狀況不干擾庫存與店員行為的斷言 */
const INTRUSIVE_EFFECTS: readonly IncidentEffect['type'][] = [
  'instant-delivery',
  'free-rush-order',
  'send-staff-home',
  'dispatch-busiest-register',
];

/**
 * 預設：第一個付得起、且不改變庫存與人手的選項（例如出清選拒絕、身體不適選加給）；
 * 沒有這種選項時選第一個付得起的。
 */
export const calmOption: IncidentChooser = (incident) => {
  const calm = incident.options.findIndex(
    (o) => o.available && !o.effects.some((e) => INTRUSIVE_EFFECTS.includes(e.type)),
  );
  return calm >= 0 ? calm : incident.options.findIndex((o) => o.available);
};

/** 營業時段跑完，停在每日結算；途中發生的狀況以 choose 處理 */
export function runOpenHours(game: Game, choose: IncidentChooser = calmOption): void {
  const r = game.openStore();
  if (!r.ok) throw new Error(r.error);
  finishOpenHours(game, choose);
}

/** 從營業時段的目前時刻跑到打烊，停在每日結算；途中發生的狀況以 choose 處理 */
export function finishOpenHours(game: Game, choose: IncidentChooser = calmOption): void {
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

/**
 * 開店：準備階段下的進貨單此時送達倉庫；再以 arrange 直接布置（例如 restockSlot 把倉庫的貨擺上格位），
 * 此時顧客與店員都還沒開始動作，相當於開店前已擺好貨。
 */
export function openStoreArranged(game: Game, arrange: () => void): void {
  const r = game.openStore();
  if (!r.ok) throw new Error(r.error);
  arrange();
}

/** 推進一次 tick；若有狀況等待選擇，先以 choose 處理（逐步推進營業時段的測試用，避免卡在等待選擇） */
export function tickResolving(game: Game, realDtMs: number, choose: IncidentChooser = calmOption): void {
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
