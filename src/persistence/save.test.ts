import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_TICK, STEP_MS } from '../sim/clock/clock';
import { Game } from '../sim/game';
import { totalQty } from '../sim/inventory/batch';
import { SNAPSHOT_VERSION } from '../sim/snapshot';
import { openStoreArranged, playThroughDay, runOpenHours, tickResolving } from '../sim/test-helpers';
import { SAVE_KEY, clearSave, loadGame, readSave, saveGame } from './save';

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

  it('存讀檔後今天與明天的天氣、星期相等，之後的天氣序列也與沒中斷時相同', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    expect(game.snapshot()?.weather).toMatchObject({ today: game.today.weather, tomorrow: game.forecast.weather });
    saveGame(game, storage);
    const loaded = loadGame(storage)!;
    expect(loaded.today).toEqual(game.today);
    expect(loaded.forecast).toEqual(game.forecast);
    for (let i = 0; i < 6; i++) {
      playThroughDay(game);
      playThroughDay(loaded);
      expect(loaded.today).toEqual(game.today);
      expect(loaded.forecast).toEqual(game.forecast);
    }
  });

  it('存讀檔後今天的每日目標相等，之後每天的每日目標也與沒中斷時相同', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    expect(game.dailyGoal).not.toBeNull();
    expect(game.snapshot()?.dailyGoal.today).toMatchObject({ kind: game.dailyGoal!.kind, target: game.dailyGoal!.target });
    saveGame(game, storage);
    const loaded = loadGame(storage)!;
    expect(loaded.dailyGoal).toEqual(game.dailyGoal);
    for (let i = 0; i < 5; i++) {
      runOpenHours(game);
      runOpenHours(loaded);
      expect(loaded.lastReport!.dailyGoal).toEqual(game.lastReport!.dailyGoal);
      game.startNextDay();
      loaded.startNextDay();
      expect(loaded.dailyGoal).toEqual(game.dailyGoal);
    }
  });

  it('第 1 天（沒有每日目標）存讀檔後仍沒有每日目標', () => {
    const storage = new MemoryStorage();
    saveGame(new Game({ seed: 4 }), storage);
    expect(loadGame(storage)!.dailyGoal).toBeNull();
  });

  it('快照版本號遞增為 7', () => {
    expect(SNAPSHOT_VERSION).toBe(7);
  });

  it('準備階段有待送進貨單時存讀檔，開店時送達倉庫', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    const before = game.backroomQty('cola');
    expect(game.pendingOrders).toEqual([expect.objectContaining({ placedDay: game.day, deliveryDay: game.day })]);
    saveGame(game, storage);
    const loaded = loadGame(storage)!;
    expect(loaded.pendingOrders).toEqual(game.pendingOrders);
    expect(loaded.backroomQty('cola')).toBe(before);
    loaded.openStore();
    expect(loaded.backroomQty('cola')).toBe(before + 12);
    expect(loaded.pendingOrders).toHaveLength(0);
  });

  it('v6 存檔（待送單在進入準備階段時送達）遷移後，待送單改於這次開店時送達', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    const current = game.snapshot()!;
    // v6 的規則：準備階段下的單隔天送達
    const v6 = {
      ...current,
      version: 6,
      pendingOrders: current.pendingOrders.map((o) => ({ ...o, deliveryDay: o.placedDay + 1 })),
    };
    storage.setItem(SAVE_KEY, JSON.stringify(v6));
    const loaded = loadGame(storage)!;
    expect(loaded.snapshot()).toEqual(current);
    expect(loaded.pendingOrders.every((o) => o.deliveryDay === loaded.day)).toBe(true);
    const before = loaded.backroomQty('cola');
    loaded.openStore();
    expect(loaded.backroomQty('cola')).toBe(before + 12);
    expect(loaded.pendingOrders).toHaveLength(0);
  });

  it('v5 存檔（待送進貨單沒有送達日）遷移後讀得進來，待送單於這次開店時送達', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    const current = game.snapshot()!;
    expect(current.pendingOrders.length).toBeGreaterThan(0);
    const v5 = {
      ...current,
      version: 5,
      pendingOrders: current.pendingOrders.map((o) => ({ lines: o.lines, placedDay: o.placedDay, total: o.total })),
    };
    storage.setItem(SAVE_KEY, JSON.stringify(v5));
    const loaded = loadGame(storage)!;
    expect(loaded).not.toBeNull();
    expect(loaded.snapshot()).toEqual(current);
    expect(loaded.pendingOrders.every((o) => o.deliveryDay === loaded.day)).toBe(true);
    loaded.openStore();
    expect(loaded.pendingOrders).toHaveLength(0);
  });

  it('v4（沒有每日目標欄位，早於可遷移的最舊版本）的存檔無法讀取', () => {
    const storage = new MemoryStorage();
    const old = { ...establishedGame().snapshot()!, version: 4 } as Record<string, unknown>;
    delete old.dailyGoal;
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    expect(loadGame(storage)).toBeNull();
  });

  it('更舊的版本（沒有天氣欄位）的存檔無法讀取', () => {
    const storage = new MemoryStorage();
    const old = { ...establishedGame().snapshot()!, version: 3 } as Record<string, unknown>;
    delete old.weather;
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    expect(loadGame(storage)).toBeNull();
  });

  it('舊版本（沒有狀況欄位）的存檔無法讀取', () => {
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

  it('區分沒有存檔、讀取成功與無法讀取', () => {
    const storage = new MemoryStorage();
    expect(readSave(storage)).toEqual({ status: 'none' });
    saveGame(establishedGame(), storage);
    expect(readSave(storage).status).toBe('loaded');
  });

  it('比遊戲新、早於 v5、JSON 損毀、還原失敗的存檔無法讀取，而且存檔內容原樣保留', () => {
    const current = establishedGame().snapshot()!;
    const broken = [
      JSON.stringify({ ...current, version: SNAPSHOT_VERSION + 1 }),
      JSON.stringify({ ...current, version: 4 }),
      JSON.stringify({ ...current, version: 'six' }),
      '{not json',
      'null',
      JSON.stringify({ version: 5 }),
      JSON.stringify({ ...current, inventory: null }),
    ];
    for (const raw of broken) {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, raw);
      expect(readSave(storage)).toEqual({ status: 'unreadable' });
      expect(loadGame(storage)).toBeNull();
      expect([...storage.data]).toEqual([[SAVE_KEY, raw]]);
    }
  });

  it('沒有 storage 時不出錯', () => {
    expect(readSave(null)).toEqual({ status: 'none' });
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
    expect(loaded.pendingOrders).toEqual([
      expect.objectContaining({ lines: [{ productId: 'chips', qty: 12 }], deliveryDay: loaded.day }),
    ]);
    // 存讀檔後開店時送達
    const before = loaded.backroomQty('chips');
    loaded.openStore();
    expect(loaded.backroomQty('chips')).toBe(before + 12);
    expect(loaded.pendingOrders).toHaveLength(0);
  });

  it('營業中換貨後打烊，進入準備階段存讀檔：換貨已完成、狀態相等、版本號不變', () => {
    const storage = new MemoryStorage();
    const game = establishedGame();
    const fridge = game.fixtures.find((f) => f.kind === 'fridge')!.id;
    // 陳列庫存為 0 的格位換貨會立即生效：開店時可樂送達、先擺上架。
    // 沒有店員來下架，換貨留到打烊時直接完成
    for (const s of game.staff) game.fireStaff(s.id);
    openStoreArranged(game, () => game.restockSlot(fridge, 0));
    expect(game.slots(fridge)[0]!.productId).toBe('cola');
    expect(totalQty(game.slots(fridge)[0]!.batches)).toBeGreaterThan(0);
    expect(game.assignSlot(fridge, 0, 'water').ok).toBe(true);
    expect(game.changeovers).toHaveLength(1);
    while (game.phase === 'open') tickResolving(game, STEP_MS * MAX_STEPS_PER_TICK);
    game.startNextDay();
    expect(game.changeovers).toEqual([]);
    expect(game.slots(fridge)[0]).toEqual({ productId: 'water', batches: [] });

    expect(saveGame(game, storage)).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.snapshot()).toEqual(game.snapshot());
    expect(loaded.snapshot()!.version).toBe(SNAPSHOT_VERSION);
    expect(loaded.changeovers).toEqual([]);
  });

  it('清除存檔', () => {
    const storage = new MemoryStorage();
    saveGame(new Game({ seed: 1 }), storage);
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });
});
