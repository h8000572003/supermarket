import type { CategoryId } from './catalog/products';
import type { DailyGoalDef, GoalDayStats } from './goals/daily-goal';
import type { Speed } from './clock/clock';
import type { PurchaseOrder } from './economy/purchase-order';
import type { IncidentKind } from './incidents/incidents';
import type { InventorySnapshot } from './inventory/inventory';
import type { WasteLine } from './report/daily-report';
import type { Fixture } from './store/store-layout';
import type { Weather } from './weather/weather';

/** 快照格式版本；結構改變時遞增，並在 persistence/migrations.ts 加上前一版的遷移（ADR 0006） */
export const SNAPSHOT_VERSION = 7;

/**
 * 準備階段的完整遊戲狀態（見 ADR 0002）。
 * 不含營業時段的人物與隊伍等瞬時狀態。
 */
export interface GameSnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  readonly day: number;
  readonly funds: number;
  readonly reputation: number;
  readonly totalRevenue: number;
  readonly bestServed: number;
  readonly negativeDays: number;
  readonly achieved: readonly string[];
  readonly unlocked: readonly CategoryId[];
  readonly salePrices: readonly (readonly [string, number])[];
  readonly fixtures: readonly Fixture[];
  readonly nextFixtureId: number;
  readonly inventory: InventorySnapshot;
  readonly staff: readonly { readonly id: string; readonly name: string }[];
  readonly nextStaffId: number;
  readonly pendingOrders: readonly PurchaseOrder[];
  readonly rngState: number;
  readonly speed: Speed;
  /** 前一個營業日發生過的狀況種類，讓讀檔後仍維持「不連續兩天同種類」 */
  readonly previousIncidentKinds: readonly IncidentKind[];
  /** 今天與明天的天氣（星期由天數算出）；rngState 是天氣專用亂數流的狀態 */
  readonly weather: {
    readonly today: Weather;
    readonly tomorrow: Weather;
    readonly tomorrowStreak: number;
    readonly rngState: number;
  };
  /** 今天的每日目標（第 1 天為 null）、設定目標數字用的最近成績、每日目標專用亂數流的狀態 */
  readonly dailyGoal: {
    readonly today: DailyGoalDef | null;
    readonly history: readonly GoalDayStats[];
    readonly rngState: number;
  };
  /** 當天準備階段已記下的帳 */
  readonly ledger: {
    readonly fundsAtStart: number;
    readonly purchases: number;
    readonly fixtures: number;
    readonly waste: readonly WasteLine[];
  };
}
