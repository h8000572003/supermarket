import { SNAPSHOT_VERSION } from '../sim/snapshot';
import type { GameSnapshot } from '../sim/snapshot';

/** 還能遷移的最舊快照版本；更舊的存檔無法讀取（ADR 0006） */
export const OLDEST_MIGRATABLE_VERSION = 5;

type RawSnapshot = Record<string, unknown>;

/** 第 N 項把 vN 的快照升成 vN+1 */
const MIGRATIONS: Readonly<Record<number, (s: RawSnapshot) => RawSnapshot>> = {
  // v6：每張待送進貨單記下送達日；v5 的待送單一律是下單隔天送達
  5: (s) => ({
    ...s,
    version: 6,
    pendingOrders: (s.pendingOrders as { placedDay: number }[]).map((o) => ({ ...o, deliveryDay: o.placedDay + 1 })),
  }),
};

/**
 * 把讀進來的快照依序遷移到目前版本。
 * 版本早於 OLDEST_MIGRATABLE_VERSION、比遊戲新或不是快照時拋錯。
 */
export function migrateSnapshot(raw: unknown): GameSnapshot {
  if (typeof raw !== 'object' || raw === null) throw new Error('存檔不是快照');
  let s = raw as RawSnapshot;
  const version = s.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new Error('存檔沒有版本號');
  if (version < OLDEST_MIGRATABLE_VERSION) throw new Error(`存檔版本 ${version} 太舊`);
  if (version > SNAPSHOT_VERSION) throw new Error(`存檔版本 ${version} 比遊戲新`);
  for (let v = version; v < SNAPSHOT_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new Error(`缺少 v${v} 的遷移`);
    s = migrate(s);
  }
  return s as unknown as GameSnapshot;
}
