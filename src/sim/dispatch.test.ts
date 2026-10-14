import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { STEP_MS } from './clock/clock';
import { MAX_DISPATCHES, Game } from './game';
import type { DispatchTarget } from './game';
import { totalQty } from './inventory/batch';
import { finishOpenHours, openStoreArranged, runOpenHours, tickResolving } from './test-helpers';

const CAP = FIXTURES.fridge.slotCapacity;

/**
 * 第 2 天準備階段、沒有顧客：冷藏櫃 4 格都放可樂，收銀台一台。
 * 格位 0 有 4 瓶（高於補貨門檻、未滿）、格位 1、2 已滿、格位 3 空著；倉庫有 backroom 瓶。
 */
function store({ staff = 1, backroom = 12 }: { staff?: number; backroom?: number } = {}) {
  const game = new Game({ seed: 1, customerArrivals: false });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 6, y: 3 }, facing: 'south' });
  const register = place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  for (let i = 0; i < 4; i++) game.assignSlot(fridge, i, 'cola');
  game.submitPurchaseOrder([{ productId: 'cola', qty: 24 }]);
  if (backroom > 0) game.submitPurchaseOrder([{ productId: 'cola', qty: backroom }]);
  // 第 1 天開店時送達：用 24 瓶擺好格位，其餘留在倉庫；沒有店員與顧客，到打烊都不變
  openStoreArranged(game, () => {
    game.restockSlot(fridge, 1);
    game.restockSlot(fridge, 2);
    game.restockSlot(fridge, 0, 24 - 2 * CAP);
  });
  finishOpenHours(game);
  game.startNextDay();
  for (let i = 0; i < staff; i++) game.hireStaff();
  const slot = (slotIndex: number): DispatchTarget => ({ kind: 'slot', fixtureId: fridge, slotIndex });
  const qty = (slotIndex: number) => totalQty(game.slots(fridge)[slotIndex]?.batches ?? []);
  return { game, fridge, register, slot, qty, registerTarget: { kind: 'register', registerId: register } as const };
}

/** 逐步推進直到條件成立或打烊 */
function stepUntil(game: Game, done: () => boolean): void {
  while (game.phase === 'open' && !done()) tickResolving(game, STEP_MS);
}

describe('派工', () => {
  it('布置：格位 0 高於補貨門檻但未滿，倉庫有貨', () => {
    const { game, qty } = store();
    expect([qty(0), qty(1), qty(2), qty(3)]).toEqual([4, CAP, CAP, 0]);
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('準備階段派工被拒；營業中可用', () => {
    const { game, slot, registerTarget } = store();
    expect(game.dispatch(slot(0))).toEqual({ ok: false, error: 'not-open-hours' });
    expect(game.dispatch(registerTarget)).toEqual({ ok: false, error: 'not-open-hours' });
    expect(game.dispatches).toEqual([]);
    game.openStore();
    expect(game.dispatch(slot(0)).ok).toBe(true);
    expect(game.dispatches).toEqual([slot(0)]);
    expect(game.isDispatched(slot(0))).toBe(true);
  });

  it('沒有派工時，高於補貨門檻的格位不會被補', () => {
    const { game, qty } = store();
    runOpenHours(game);
    expect(qty(0)).toBe(4);
    expect(game.backroomQty('cola')).toBe(12 - CAP);
  });

  it('對高於補貨門檻的格位派工：店員從倉庫取貨補滿，之後標記清除', () => {
    const { game, slot, qty } = store();
    game.openStore();
    expect(game.dispatch(slot(0)).ok).toBe(true);
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    expect(qty(0)).toBe(CAP);
    expect(game.isDispatched(slot(0))).toBe(false);
  });

  it('派工優先於一般補貨', () => {
    const { game, slot, qty } = store();
    game.openStore();
    // 格位 3 是空的（一般補貨對象），但派工的格位 0 先被處理
    game.dispatch(slot(0));
    stepUntil(game, () => game.dispatches.length === 0);
    expect(qty(0)).toBe(CAP);
    expect(qty(3)).toBe(0);
  });

  it('對收銀台派工：店員前往收銀台；隊伍清空後恢復自動工作', () => {
    const { game, register, registerTarget, qty } = store();
    game.openStore();
    expect(game.dispatch(registerTarget).ok).toBe(true);
    const agent = game.staffAgents[0]!;
    stepUntil(game, () => agent.activity === 'cashier');
    expect(agent.registerId).toBe(register);
    // 沒有人排隊：抵達後標記即清除
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    // 之後解除收銀，回去補空的格位 3
    stepUntil(game, () => agent.registerId === null);
    expect(game.phase).toBe('open');
    runToClose(game);
    expect(qty(3)).toBe(CAP);
  });

  it(`同時最多 ${MAX_DISPATCHES} 個派工標記；同一目標不能重複`, () => {
    const { game, slot, registerTarget } = store({ staff: 0 });
    game.openStore();
    expect(game.dispatch(slot(0)).ok).toBe(true);
    expect(game.dispatch(slot(0))).toEqual({ ok: false, error: 'already-dispatched' });
    expect(game.dispatch(slot(3)).ok).toBe(true);
    expect(game.dispatch(registerTarget)).toEqual({ ok: false, error: 'dispatch-full' });
    expect(game.dispatches).toHaveLength(MAX_DISPATCHES);
  });

  it('倉庫沒貨的格位派工被拒並有原因；已滿或不存在的格位也被拒', () => {
    const { game, slot, fridge, register } = store({ backroom: 0 });
    game.openStore();
    expect(game.dispatch(slot(0))).toEqual({ ok: false, error: 'no-backroom-stock' });
    const full = store();
    full.game.openStore();
    expect(full.game.dispatch(full.slot(1))).toEqual({ ok: false, error: 'slot-full' });
    expect(game.dispatch({ kind: 'slot', fixtureId: fridge, slotIndex: 9 })).toEqual({ ok: false, error: 'invalid-slot' });
    expect(game.dispatch({ kind: 'slot', fixtureId: register, slotIndex: 0 })).toEqual({ ok: false, error: 'invalid-slot' });
    expect(game.dispatch({ kind: 'register', registerId: fridge })).toEqual({ ok: false, error: 'unknown-fixture' });
    expect(game.dispatches).toEqual([]);
  });

  it('沒有指定商品的格位派工被拒', () => {
    const { game, fridge } = store();
    game.assignSlot(fridge, 3, null);
    game.openStore();
    expect(game.dispatch({ kind: 'slot', fixtureId: fridge, slotIndex: 3 })).toEqual({
      ok: false,
      error: 'slot-unassigned',
    });
  });

  it('取消派工後店員恢復自動工作', () => {
    const { game, slot, qty } = store();
    game.openStore();
    game.dispatch(slot(0));
    tickResolving(game, STEP_MS);
    expect(game.staffAgents[0]!.task?.slotIndex).toBe(0);
    expect(game.cancelDispatch(slot(0)).ok).toBe(true);
    expect(game.dispatches).toEqual([]);
    expect(game.cancelDispatch(slot(0))).toEqual({ ok: false, error: 'not-dispatched' });
    runToClose(game);
    // 格位 0 仍高於門檻、不會被補；空的格位 3 照常補貨
    expect(qty(0)).toBe(4);
    expect(qty(3)).toBe(CAP);
  });

  it('取消收銀台派工後，店員不再待在收銀台', () => {
    const { game, registerTarget } = store();
    game.openStore();
    game.dispatch(registerTarget);
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.registerId).not.toBeNull();
    game.cancelDispatch(registerTarget);
    stepUntil(game, () => agent.registerId === null);
    expect(game.phase).toBe('open');
  });

  it('打烊後沒有殘留的標記；隔天準備階段也不能派工', () => {
    const { game, slot, registerTarget } = store({ staff: 0 });
    game.openStore();
    game.dispatch(slot(0));
    game.dispatch(registerTarget);
    runToClose(game);
    expect(game.dispatches).toEqual([]);
    game.startNextDay();
    expect(game.dispatches).toEqual([]);
    expect(game.dispatch(slot(0))).toEqual({ ok: false, error: 'not-open-hours' });
    expect(game.cancelDispatch(slot(0))).toEqual({ ok: false, error: 'not-open-hours' });
  });
});

describe('派工與有人排隊的收銀台', () => {
  const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

  /** 有顧客的店面（同 customers.test.ts 的布置），只有 1 位店員；第 1 天已開店，開店時送達的貨已擺滿格位 */
  function busyStore() {
    const game = new Game({ seed: 5 });
    const place = (...args: Parameters<Game['placeFixture']>) => {
      const r = game.placeFixture(...args);
      if (!r.ok) throw new Error(r.error);
      return r.value.id;
    };
    const fridge = place('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    const shelfA = place('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
    const shelfB = place('shelf', { origin: { x: 3, y: 5 }, facing: 'south' });
    const register = place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
    ['cola', 'green-tea', 'cola', 'green-tea'].forEach((p, i) => game.assignSlot(fridge, i, p));
    ['chips', 'chips', 'chocolate', 'chocolate'].forEach((p, i) => game.assignSlot(shelfA, i, p));
    ['cup-noodle', 'cup-noodle', 'bowl-noodle', 'bowl-noodle'].forEach((p, i) => game.assignSlot(shelfB, i, p));
    game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 60 })));
    game.hireStaff();
    openStoreArranged(game, () => {
      for (const f of [fridge, shelfA, shelfB]) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
    });
    return { game, displays: [fridge, shelfA, shelfB], register };
  }

  it('有人排隊的收銀台仍優先於派工標記', () => {
    const { game, displays, register } = busyStore();
    const agent = game.staffAgents[0]!;
    // 等到店員正在收銀、隊伍裡還有人
    stepUntil(game, () => agent.activity === 'cashier' && game.queueLength(register) > 1);
    expect(game.phase).toBe('open');
    // 找一個被拿過、未滿的格位派工
    const target = displays
      .flatMap((fixtureId) => game.slots(fixtureId).map((s, slotIndex) => ({ fixtureId, slotIndex, s })))
      .find(({ fixtureId, s }) => totalQty(s.batches) < FIXTURES[game.fixture(fixtureId)!.kind].slotCapacity);
    expect(target).toBeDefined();
    const mark: DispatchTarget = { kind: 'slot', fixtureId: target!.fixtureId, slotIndex: target!.slotIndex };
    expect(game.dispatch(mark).ok).toBe(true);
    // 隊伍沒清空前，店員都留在收銀台
    while (game.phase === 'open' && game.queueLength(register) > 0) {
      expect(agent.registerId).toBe(register);
      expect(agent.task).toBeNull();
      tickResolving(game, STEP_MS);
    }
    // 隊伍清空後才去處理派工
    stepUntil(game, () => !game.isDispatched(mark));
    expect(game.phase).toBe('open');
  });

  it('派工途中（尚未取貨）出現排隊，店員改去收銀', () => {
    const { game, displays, register } = busyStore();
    const agent = game.staffAgents[0]!;
    let pulled = false;
    let sawDispatchTask = false;
    // 每當店員閒著時對一個未滿格位派工，觀察是否會在排隊出現時被叫去收銀
    while (game.phase === 'open' && !pulled) {
      if (game.dispatches.length === 0) {
        for (const fixtureId of displays) {
          const cap = FIXTURES[game.fixture(fixtureId)!.kind].slotCapacity;
          game.slots(fixtureId).forEach((s, slotIndex) => {
            if (game.dispatches.length === 0 && totalQty(s.batches) < cap) {
              game.dispatch({ kind: 'slot', fixtureId, slotIndex });
            }
          });
        }
      }
      const before = agent.task !== null && agent.carrying.length === 0 && agent.registerId === null;
      if (before && game.dispatches.length > 0) sawDispatchTask = true;
      tickResolving(game, STEP_MS);
      if (before && agent.registerId === register) pulled = true;
    }
    expect(sawDispatchTask).toBe(true);
    expect(pulled).toBe(true);
  });
});

function runToClose(game: Game): void {
  while (game.phase === 'open') tickResolving(game, STEP_MS * 10);
}
