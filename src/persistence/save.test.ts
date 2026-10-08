import { describe, expect, it } from 'vitest';
import { Game } from '../sim/game';
import { playThroughDay, runOpenHours } from '../sim/test-helpers';
import { SAVE_KEY, clearSave, loadGame, saveGame } from './save';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

/** 經營兩天、準備階段做了些安排的店 */
function establishedGame() {
  const game = new Game({ seed: 9 });
  const fridge = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
  const shelf = game.placeFixture('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
  game.placeFixture('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  if (!fridge.ok || !shelf.ok) throw new Error('setup');
  game.assignSlot(fridge.value.id, 0, 'cola');
  game.assignSlot(shelf.value.id, 0, 'chips');
  game.setSalePrice('cola', 33);
  game.hireStaff();
  game.hireStaff();
  game.submitPurchaseOrder([
    { productId: 'cola', qty: 36 },
    { productId: 'chips', qty: 24 },
  ]);
  playThroughDay(game);
  playThroughDay(game);
  game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
  return game;
}

describe('存檔與讀檔', () => {
  it('存→讀後快照相同', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    expect(saveGame(game, storage)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded?.snapshot()).toEqual(game.snapshot());
  });

  it('讀檔後繼續經營，結果與沒中斷時相同', () => {
    const storage = new MemoryStorage();
    const original = establishedGame();
    saveGame(original, storage);
    const loaded = loadGame(storage)!;
    runOpenHours(original);
    runOpenHours(loaded);
    expect(loaded.lastReport).toEqual(original.lastReport);
    expect(loaded.funds).toBe(original.funds);
  });

  it('營業時段不存檔', () => {
    const storage = new MemoryStorage();
    const game = new Game({ seed: 1 });
    game.openStore();
    expect(saveGame(game, storage)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('沒有存檔、格式損壞或版本不符時回傳 null', () => {
    const storage = new MemoryStorage();
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    expect(loadGame(storage)).toBeNull();
  });

  it('沒有 storage 時不出錯', () => {
    expect(saveGame(new Game({ seed: 1 }), null)).toBe(false);
    expect(loadGame(null)).toBeNull();
  });

  it('清除存檔', () => {
    const storage = new MemoryStorage();
    saveGame(new Game({ seed: 1 }), storage);
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });
});
