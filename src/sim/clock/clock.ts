/** 營業時段：遊戲內 07:00–23:00（以一天中的分鐘數表示） */
export const OPEN_MINUTE = 7 * 60;
export const CLOSE_MINUTE = 23 * 60;

/** 1x 倍速下，一個營業時段的現實長度 */
export const OPEN_HOURS_REAL_MS = 4 * 60 * 1000;

/** 模擬固定步長（1x 倍速下的現實毫秒） */
export const STEP_MS = 100;

/** 一個營業時段共有幾步 */
export const STEPS_PER_DAY = OPEN_HOURS_REAL_MS / STEP_MS;

/** 每一步推進的遊戲分鐘數 */
export const MINUTES_PER_STEP = (CLOSE_MINUTE - OPEN_MINUTE) / STEPS_PER_DAY;

/** 單次 tick 最多執行的步數，避免分頁休眠後一次補跑過多 */
export const MAX_STEPS_PER_TICK = 200;

export type Speed = 0 | 1 | 2 | 4;

export const SPEEDS: readonly Speed[] = [0, 1, 2, 4];

/** 營業時段第 step 步對應的遊戲內時刻（一天中的分鐘數） */
export function minuteOfDay(step: number): number {
  return OPEN_MINUTE + step * MINUTES_PER_STEP;
}
