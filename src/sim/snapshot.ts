import type { CategoryId } from './catalog/products';
import type { Speed } from './clock/clock';
import type { PurchaseOrder } from './economy/purchase-order';
import type { InventorySnapshot } from './inventory/inventory';
import type { WasteLine } from './report/daily-report';
import type { Fixture } from './store/store-layout';

/** 快照格式版本；結構改變時遞增，舊版存檔即不再讀取 */
export const SNAPSHOT_VERSION = 1;

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
  /** 當天準備階段已記下的帳 */
  readonly ledger: {
    readonly fundsAtStart: number;
    readonly purchases: number;
    readonly waste: readonly WasteLine[];
  };
}
