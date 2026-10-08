import type { CategoryId } from '../catalog/products';

/** 遊戲開始時的口碑 */
export const STARTING_REPUTATION = 50;

/** 新的一天的平均滿意度佔口碑的權重；其餘沿用前一天 */
const REPUTATION_WEIGHT = 0.3;

/** 以當天平均滿意度平滑更新口碑；當天沒有顧客時不變 */
export function nextReputation(current: number, avgSatisfaction: number | null): number {
  if (avgSatisfaction === null) return current;
  return current * (1 - REPUTATION_WEIGHT) + avgSatisfaction * REPUTATION_WEIGHT;
}

/** 口碑 → 來客倍率：口碑 0 為 0.5 倍、50 為 1 倍、100 為 1.5 倍 */
export function arrivalMultiplier(reputation: number): number {
  return 0.5 + reputation / 100;
}

/** 資金連續為負達這麼多個營業日即破產 */
export const BANKRUPTCY_DAYS = 3;

/** 判斷里程碑所需的累計成績 */
export interface MilestoneContext {
  readonly totalRevenue: number;
  readonly reputation: number;
  /** 單日最多結帳人數 */
  readonly bestServed: number;
}

export interface Milestone {
  readonly id: string;
  readonly name: string;
  readonly goal: string;
  /** 達成時解鎖的類別；沒有時為最終目標 */
  readonly unlocks?: CategoryId;
  /** 進度（0–1）；1 表示達成 */
  progress(ctx: MilestoneContext): number;
}

const ratio = (value: number, target: number) => Math.min(1, value / target);

export const MILESTONES: readonly Milestone[] = [
  {
    id: 'first-revenue',
    name: '站穩腳步',
    goal: '累積營收達 $20,000',
    unlocks: 'fresh',
    progress: (c) => ratio(c.totalRevenue, 20_000),
  },
  {
    id: 'good-reputation',
    name: '街坊好評',
    goal: '口碑達 65',
    unlocks: 'daily',
    progress: (c) => ratio(c.reputation, 65),
  },
  {
    id: 'busy-day',
    name: '人氣名店',
    goal: '單日結帳 150 人',
    progress: (c) => ratio(c.bestServed, 150),
  },
];
