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

/** 讀取存檔，舊版本依序遷移；沒有存檔、格式損壞或無法遷移時回傳 null */
export function loadGame(storage = defaultStorage()): Game | null {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    return Game.fromSnapshot(migrateSnapshot(JSON.parse(raw)));
  } catch {
    return null;
  }
}

export function clearSave(storage = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // 無法清除時忽略
  }
}
