import { MINUTES_PER_STEP } from '../clock/clock';

/**
 * 麻煩（Nuisance）：營業中出現在店內、不讓遊戲暫停的東西或人物。
 * 在場期間降低來客速率，與它同時在場過的顧客離店時扣一次滿意度；店員只在店長派工時處理，打烊時全部消失。
 * 每種麻煩以資料定義；新增種類時在 NuisanceKind 加 id、在 NUISANCES 加定義，需要新行為（移動、自行離開）時才改 Game。
 */
export type NuisanceKind = 'litter';

export interface NuisanceDefinition {
  readonly kind: NuisanceKind;
  readonly name: string;
  /** 在場期間來客速率乘上的倍率（多個麻煩疊乘） */
  readonly arrivalMultiplier: number;
  /** 同時在場過的顧客離店時扣的滿意度（每位顧客對同一個麻煩只扣一次） */
  readonly satisfactionPenalty: number;
  /** 店員走到旁邊後處理所需的遊戲分鐘數 */
  readonly handleMinutes: number;
}

export const NUISANCES: Readonly<Record<NuisanceKind, NuisanceDefinition>> = {
  litter: { kind: 'litter', name: '垃圾', arrivalMultiplier: 0.95, satisfactionPenalty: 5, handleMinutes: 1 },
};

export const NUISANCE_KINDS = Object.keys(NUISANCES) as NuisanceKind[];

/** 顧客每走進一個新格子時掉垃圾的機率 */
export const LITTER_CHANCE_PER_TILE = 0.003;

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
