import { MINUTES_PER_STEP } from '../clock/clock';
import type { Rng } from '../rng';

/**
 * 麻煩（Nuisance）：營業中出現在店內、不讓遊戲暫停的東西或人物。
 * 在場期間降低來客速率，與它同時在場過的顧客離店時扣一次滿意度；店員只在店長派工時處理，打烊時全部消失。
 * 每種麻煩以資料定義；新增種類時在 NuisanceKind 加 id、在 NUISANCES 加定義，需要新行為（移動、自行離開）時才改 Game。
 */
export type NuisanceKind = 'litter' | 'rat' | 'troublemaker';

export interface NuisanceDefinition {
  readonly kind: NuisanceKind;
  readonly name: string;
  /** 在場期間來客速率乘上的倍率（多個麻煩疊乘） */
  readonly arrivalMultiplier: number;
  /** 同時在場過的顧客離店時扣的滿意度（每位顧客對同一個麻煩只扣一次） */
  readonly satisfactionPenalty: number;
  /** 店員走到旁邊後處理所需的遊戲分鐘數 */
  readonly handleMinutes: number;
  /** 在店內走動的速度（格 / 步）；0 為不會移動 */
  readonly speed: number;
}

export const NUISANCES: Readonly<Record<NuisanceKind, NuisanceDefinition>> = {
  litter: { kind: 'litter', name: '垃圾', arrivalMultiplier: 0.95, satisfactionPenalty: 5, handleMinutes: 1, speed: 0 },
  rat: { kind: 'rat', name: '老鼠', arrivalMultiplier: 0.8, satisfactionPenalty: 15, handleMinutes: 3, speed: 0.15 },
  troublemaker: {
    kind: 'troublemaker',
    name: '奧客',
    arrivalMultiplier: 0.85,
    satisfactionPenalty: 10,
    handleMinutes: 5,
    speed: 0.12,
  },
};

/** 排程出現的麻煩（老鼠、奧客）：第幾個營業日起出現、每天出現的機率（每天最多 1 次） */
export const SCHEDULED_NUISANCES: readonly { readonly kind: NuisanceKind; readonly chance: number }[] = [
  { kind: 'rat', chance: 0.4 },
  { kind: 'troublemaker', chance: 0.4 },
];
export const FIRST_SCHEDULED_NUISANCE_DAY = 3;
/** 排程麻煩出現的時刻範圍（一天中的分鐘數，08:00–20:00） */
export const SCHEDULED_NUISANCE_EARLIEST = 8 * 60;
export const SCHEDULED_NUISANCE_LATEST = 20 * 60;

/** 奧客附近（切比雪夫距離這麼多格以內）待過的顧客，離店時再扣一次滿意度 */
export const TROUBLEMAKER_RADIUS = 3;
export const TROUBLEMAKER_NEARBY_PENALTY = 10;
/** 沒人勸離時，奧客在店內待這麼多遊戲分鐘後自己離開 */
export const TROUBLEMAKER_STAY_MINUTES = 90;

/** 今天排定出現的麻煩 */
export interface ScheduledNuisance {
  readonly kind: NuisanceKind;
  /** 出現的時刻（一天中的分鐘數） */
  readonly minute: number;
}

/** 開店時排定今天的老鼠與奧客（第 3 個營業日起，各以一定機率、每天最多 1 次）；依時刻排序 */
export function scheduleNuisances(rng: Rng, day: number): ScheduledNuisance[] {
  if (day < FIRST_SCHEDULED_NUISANCE_DAY) return [];
  const scheduled: ScheduledNuisance[] = [];
  for (const { kind, chance } of SCHEDULED_NUISANCES) {
    if (!rng.chance(chance)) continue;
    scheduled.push({ kind, minute: rng.int(SCHEDULED_NUISANCE_EARLIEST, SCHEDULED_NUISANCE_LATEST) });
  }
  return scheduled.sort((a, b) => a.minute - b.minute);
}

export const NUISANCE_KINDS = Object.keys(NUISANCES) as NuisanceKind[];

/** 顧客每走進一個新格子時掉垃圾的機率（標準經營下平均每天約 1–2 個，越忙越多） */
export const LITTER_CHANCE_PER_TILE = 0.0008;
/** 從第幾個營業日起顧客會掉垃圾（第 1 天讓新手先熟悉） */
export const FIRST_LITTER_DAY = 2;
/** 地上同時最多幾個垃圾；已達上限時不再掉新的 */
export const MAX_LITTER = 3;

/** 處理所需的步數（至少 1 步） */
export function handleSteps(kind: NuisanceKind): number {
  return Math.max(1, Math.round(NUISANCES[kind].handleMinutes / MINUTES_PER_STEP));
}

/** 在場麻煩的來客倍率乘積 */
export function nuisanceArrivalMultiplier(kinds: readonly NuisanceKind[]): number {
  return kinds.reduce((m, k) => m * NUISANCES[k].arrivalMultiplier, 1);
}

/** 單一種類麻煩當天的出現與處理數 */
export interface NuisanceCount {
  readonly appeared: number;
  readonly handled: number;
}

/** 每日結算的麻煩摘要 */
export interface NuisanceSummary {
  readonly byKind: Readonly<Record<NuisanceKind, NuisanceCount>>;
  /** 全部麻煩累計在場的遊戲分鐘數 */
  readonly minutes: number;
}

export function emptyNuisanceSummary(): NuisanceSummary {
  return {
    byKind: Object.fromEntries(NUISANCE_KINDS.map((k) => [k, { appeared: 0, handled: 0 }])) as Record<
      NuisanceKind,
      NuisanceCount
    >,
    minutes: 0,
  };
}

/** 麻煩亂數流的種子：由開店時主亂數的狀態與營業日導出，不消耗主亂數，讀檔後結果相同 */
export function nuisanceSeed(rngState: number, day: number): number {
  return (Math.imul(rngState ^ 0x27d4eb2f, 0x85ebca6b) ^ Math.imul(day, 0xc2b2ae35)) >>> 0;
}
