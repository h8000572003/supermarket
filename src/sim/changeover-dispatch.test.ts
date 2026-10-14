import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { STEP_MS } from './clock/clock';
import { Game } from './game';
import type { DispatchTarget } from './game';
import { totalQty } from './inventory/batch';
import { finishOpenHours, openStoreArranged, tickResolving } from './test-helpers';

const CAP = FIXTURES.fridge.slotCapacity;

/**
 * 同 changeover.test.ts 的布置：第 2 天準備階段、沒有顧客，冷藏櫃 4 格都放可樂，收銀台一台。
 * 格位 0–2 已滿，格位 3 有 slot3 瓶；倉庫有 cola 瓶可樂、tea 瓶綠茶。
 */
function store({ staff = 1, slot3 = CAP, cola = 12, tea = 12 }: { staff?: number; slot3?: number; cola?: number; tea?: number } = {}) {
  const game = new Game({ seed: 1, customerArrivals: false });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 6, y: 3 }, facing: 'south' });
  place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  for (let i = 0; i < 4; i++) game.assignSlot(fridge, i, 'cola');
  game.submitPurchaseOrder([{ productId: 'cola', qty: 3 * CAP + slot3 }]);
  const rest = [
    { productId: 'cola', qty: cola },
    { productId: 'green-tea', qty: tea },
  ].filter((l) => l.qty > 0);
  if (rest.length > 0) game.submitPurchaseOrder(rest);
  // 第 1 天開店時送達：擺好格位，其餘留在倉庫；沒有店員與顧客，到打烊都不變
  openStoreArranged(game, () => {
    for (let i = 0; i < 3; i++) game.restockSlot(fridge, i);
    game.restockSlot(fridge, 3, slot3);
  });
  finishOpenHours(game);
  game.startNextDay();
  for (let i = 0; i < staff; i++) game.hireStaff();
  const slot = (slotIndex: number): DispatchTarget => ({ kind: 'slot', fixtureId: fridge, slotIndex });
  const qty = (slotIndex: number) => totalQty(game.slots(fridge)[slotIndex]?.batches ?? []);
  const product = (slotIndex: number) => game.slots(fridge)[slotIndex]?.productId;
  return { game, fridge, slot, qty, product };
}

/** 逐步推進直到條件成立或打烊 */
function stepUntil(game: Game, done: () => boolean): void {
  while (game.phase === 'open' && !done()) tickResolving(game, STEP_MS);
}

describe('派工到換貨中的格位：下令', () => {
  it('舊商品滿架、換貨中的格位可以派工（沒有換貨的滿架格位仍被拒）', () => {
    const { game, fridge, slot, qty } = store({ staff: 0 });
    game.openStore();
    expect(qty(0)).toBe(CAP);
    expect(game.dispatch(slot(1))).toEqual({ ok: false, error: 'slot-full' });
    game.assignSlot(fridge, 0, 'green-tea');
    expect(game.dispatch(slot(0)).ok).toBe(true);
    expect(game.isDispatched(slot(0))).toBe(true);
  });

  it('倉庫沒有新商品時派工被拒，即使倉庫有舊商品', () => {
    const { game, fridge, slot } = store({ staff: 0, tea: 0 });
    game.openStore();
    expect(game.backroomQty('cola')).toBe(12);
    game.assignSlot(fridge, 0, 'green-tea');
    expect(game.dispatch(slot(0))).toEqual({ ok: false, error: 'no-backroom-stock' });
    expect(game.dispatches).toEqual([]);
  });

  it('倉庫只有新商品、沒有舊商品時可以派工', () => {
    const { game, fridge, slot } = store({ staff: 0, cola: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    expect(game.dispatch(slot(0)).ok).toBe(true);
  });

  it('沒有店員處理時，下架前標記保留（舊商品滿架也不清除）', () => {
    const { game, fridge, slot } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    game.dispatch(slot(0));
    for (let i = 0; i < 50; i++) tickResolving(game, STEP_MS);
    expect(game.isDispatched(slot(0))).toBe(true);
    expect(game.changeover(fridge, 0)).not.toBeNull();
  });
});

describe('派工到換貨中的格位：店員先下架再補滿新商品', () => {
  it('店員先下架，接著補滿新商品，完成後標記清除', () => {
    const { game, fridge, slot, qty, product } = store();
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    expect(game.dispatch(slot(0)).ok).toBe(true);
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'clear-out', fixtureId: fridge, slotIndex: 0 });
    expect(agent.onDispatch).toBe(true);
    // 取下的那一刻：格位改成新商品且為空，標記仍在
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('green-tea');
    expect(qty(0)).toBe(0);
    expect(game.isDispatched(slot(0))).toBe(true);
    // 新商品補滿前標記都在
    while (game.phase === 'open' && qty(0) < CAP) {
      expect(game.isDispatched(slot(0))).toBe(true);
      tickResolving(game, STEP_MS);
    }
    expect(game.phase).toBe('open');
    expect(qty(0)).toBe(CAP);
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('green-tea');
    expect(game.backroomQty('green-tea')).toBe(12 - CAP);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
  });

  it('派工的下架優先於一般的下架：先換的格位等派工的格位完成後才處理', () => {
    const { game, fridge, slot } = store();
    game.openStore();
    game.assignSlot(fridge, 1, 'green-tea');
    game.assignSlot(fridge, 0, 'green-tea');
    game.dispatch(slot(0));
    tickResolving(game, STEP_MS);
    expect(game.staffAgents[0]!.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    expect(game.changeover(fridge, 1)).not.toBeNull();
  });

  it('派工的下架優先於一般補貨：正要去補貨的店員改去下架', () => {
    // 格位 3 低於補貨門檻，店員開店後立刻去補貨
    const { game, fridge, slot, qty } = store({ slot3: 2 });
    game.openStore();
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'restock', slotIndex: 3 });
    game.assignSlot(fridge, 0, 'green-tea');
    game.dispatch(slot(0));
    tickResolving(game, STEP_MS);
    expect(agent.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    expect(agent.onDispatch).toBe(true);
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    expect(qty(0)).toBe(CAP);
  });

  it('換成不指定商品的格位派工：店員去下架，下架後標記清除', () => {
    const { game, fridge, slot, qty, product } = store();
    game.openStore();
    game.assignSlot(fridge, 0, null);
    expect(game.dispatch(slot(0)).ok).toBe(true);
    tickResolving(game, STEP_MS);
    expect(game.staffAgents[0]!.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBeNull();
    expect(qty(0)).toBe(0);
    tickResolving(game, STEP_MS);
    expect(game.isDispatched(slot(0))).toBe(false);
  });

  it('取消派工：店員放下尚未取下的下架，換貨照常由店員完成', () => {
    const { game, fridge, slot, product } = store();
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    game.dispatch(slot(0));
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.onDispatch).toBe(true);
    expect(game.cancelDispatch(slot(0)).ok).toBe(true);
    expect(agent.onDispatch).toBe(false);
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('green-tea');
    expect(game.dispatches).toEqual([]);
  });
});

describe('派工中的格位開始換貨', () => {
  it('還沒取貨的派工補貨放下，改成先下架再補滿新商品', () => {
    const { game, fridge, slot, qty, product } = store({ slot3: 4 });
    game.openStore();
    game.dispatch(slot(3));
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'restock', slotIndex: 3 });
    expect(agent.onDispatch).toBe(true);
    game.assignSlot(fridge, 3, 'green-tea');
    expect(agent.task).toBeNull();
    expect(game.isDispatched(slot(3))).toBe(true);
    tickResolving(game, STEP_MS);
    expect(agent.task).toMatchObject({ kind: 'clear-out', slotIndex: 3 });
    expect(agent.onDispatch).toBe(true);
    // 舊商品一瓶都沒有再從倉庫拿出來
    while (game.phase === 'open' && game.changeover(fridge, 3)) {
      expect(game.backroomQty('cola')).toBe(12);
      tickResolving(game, STEP_MS);
    }
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.phase).toBe('open');
    expect(product(3)).toBe('green-tea');
    expect(qty(3)).toBe(CAP);
    expect(game.backroomQty('cola')).toBe(12 + 4);
  });

  it('倉庫沒有新商品時，換貨照常由店員下架（不算派工），下架後標記清除', () => {
    const { game, fridge, slot, qty, product } = store({ slot3: 4, tea: 0 });
    game.openStore();
    game.dispatch(slot(3));
    tickResolving(game, STEP_MS);
    game.assignSlot(fridge, 3, 'green-tea');
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'clear-out', slotIndex: 3 });
    expect(agent.onDispatch).toBe(false);
    stepUntil(game, () => game.changeover(fridge, 3) === null);
    expect(game.phase).toBe('open');
    tickResolving(game, STEP_MS);
    expect(game.isDispatched(slot(3))).toBe(false);
    expect(product(3)).toBe('green-tea');
    expect(qty(3)).toBe(0);
  });

  it('沒有店員時，倉庫沒有新商品的換貨派工標記清除', () => {
    const { game, fridge, slot } = store({ staff: 0, slot3: 4, tea: 0 });
    game.openStore();
    game.dispatch(slot(3));
    game.assignSlot(fridge, 3, 'green-tea');
    tickResolving(game, STEP_MS);
    expect(game.isDispatched(slot(3))).toBe(false);
    expect(game.changeover(fridge, 3)).not.toBeNull();
  });
});
