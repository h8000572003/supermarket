import { Game } from '../sim/game';
import { migrateSnapshot } from './migrations';

export const SAVE_KEY = 'convenience-store-sim/save';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage 可能不存在或拋錯（隱私模式等），一律視為無法存檔 */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 只在準備階段存檔；回傳是否成功 */
export function saveGame(game: Game, storage = defaultStorage()): boolean {
  const snapshot = game.snapshot();
  if (!snapshot || !storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/**
 * 讀存檔的結果：沒有存檔、讀取成功，或存檔無法讀取（太舊、比遊戲新、損毀、遷移或還原失敗）。
 * 無法讀取的存檔保留原樣，不刪也不覆蓋（ADR 0006）。
 */
export type SaveReadResult =
  | { readonly status: 'none' }
  | { readonly status: 'loaded'; readonly game: Game }
  | { readonly status: 'unreadable' };

/** 讀取存檔，舊版本依序遷移；不會改動 storage */
export function readSave(storage = defaultStorage()): SaveReadResult {
  let raw: string | null | undefined;
  try {
    raw = storage?.getItem(SAVE_KEY);
  } catch {
    return { status: 'none' };
  }
  if (!raw) return { status: 'none' };
  try {
    return { status: 'loaded', game: Game.fromSnapshot(migrateSnapshot(JSON.parse(raw))) };
  } catch {
    return { status: 'unreadable' };
  }
}

/** 讀取存檔；沒有存檔或無法讀取時回傳 null */
export function loadGame(storage = defaultStorage()): Game | null {
  const r = readSave(storage);
  return r.status === 'loaded' ? r.game : null;
}

export function clearSave(storage = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // 無法清除時忽略
  }
}
