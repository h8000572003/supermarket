import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_TICK, STEP_MS } from '../sim/clock/clock';
import { Game } from '../sim/game';
import { playThroughDay, runOpenHours, tickResolving } from '../sim/test-helpers';
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

  it('記錄前一天的狀況種類，讀檔後仍不連續兩天發生同種類', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    const yesterday = game.lastReport!.incidents.map((i) => i.kind);
    expect(yesterday.length).toBeGreaterThan(0);
    expect(game.snapshot()?.previousIncidentKinds).toEqual(yesterday);
    saveGame(game, storage);
    const loaded = loadGame(storage)!;
    expect(loaded.snapshot()?.previousIncidentKinds).toEqual(yesterday);
    runOpenHours(loaded);
    const today = loaded.lastReport!.incidents.map((i) => i.kind);
    expect(today.length).toBeGreaterThan(0);
    for (const kind of today) expect(yesterday).not.toContain(kind);
  });

  it('舊版本（沒有狀況欄位）的存檔直接捨棄', () => {
    const storage = new MemoryStorage();
    const old = { ...establishedGame().snapshot()!, version: 2 } as Record<string, unknown>;
    delete old.previousIncidentKinds;
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    expect(loadGame(storage)).toBeNull();
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

  it('打烊前未送達的緊急叫貨，進入準備階段存讀檔後仍在', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    game.openStore();
    // 21:30 下單，預計 23:30 送達，晚於打烊
    while (game.minuteOfDay < 21 * 60 + 30) tickResolving(game, STEP_MS / game.speed);
    expect(game.placeRushOrder([{ productId: 'chips', qty: 12 }]).ok).toBe(true);
    while (game.phase === 'open') tickResolving(game, STEP_MS * MAX_STEPS_PER_TICK);
    game.startNextDay();

    expect(saveGame(game, storage)).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.snapshot()).toEqual(game.snapshot());
    expect(loaded.snapshot()!.inventory.backroom).toContainEqual({ productId: 'chips', qty: 12, arrivedDay: loaded.day });
  });

  it('清除存檔', () => {
    const storage = new MemoryStorage();
    saveGame(new Game({ seed: 1 }), storage);
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });
});
