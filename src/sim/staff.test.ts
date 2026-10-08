import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { DAILY_RENT, DAILY_WAGE, Game, MAX_STAFF } from './game';
import { totalQty } from './inventory/batch';
import { playThroughDay, runOpenHours } from './test-helpers';

/** 冷藏櫃（4 格）放可樂；倉庫有 qty 瓶可樂（第 2 天送達） */
function storeWithCola(qty: number, staffCount: number) {
  const game = new Game({ seed: 1 });
  const fridge = game.placeFixture('fridge', { origin: { x: 6, y: 3 }, facing: 'south' });
  if (!fridge.ok) throw new Error(fridge.error);
  game.submitPurchaseOrder([{ productId: 'cola', qty }]);
  playThroughDay(game);
  for (let i = 0; i < staffCount; i++) game.hireStaff();
  return { game, fridgeId: fridge.value.id };
}

const slotQty = (game: Game, fridgeId: string, i: number) => totalQty(game.slots(fridgeId)[i]?.batches ?? []);

describe('雇用與日薪', () => {
  it('只能在準備階段雇用 / 解雇', () => {
    const game = new Game({ seed: 1 });
    const r = game.hireStaff();
    if (!r.ok) throw new Error(r.error);
    game.openStore();
    expect(game.hireStaff()).toEqual({ ok: false, error: 'not-prep-phase' });
    expect(game.fireStaff(r.value.id)).toEqual({ ok: false, error: 'not-prep-phase' });
  });

  it('人數上限', () => {
    const game = new Game({ seed: 1 });
    for (let i = 0; i < MAX_STAFF; i++) expect(game.hireStaff().ok).toBe(true);
    expect(game.hireStaff()).toEqual({ ok: false, error: 'staff-full' });
  });

  it('雇用不扣款，打烊時依人數支付日薪', () => {
    const game = new Game({ seed: 1 });
    game.hireStaff();
    game.hireStaff();
    const funds = game.funds;
    runOpenHours(game);
    expect(game.lastReport?.wages).toBe(2 * DAILY_WAGE);
    expect(game.funds).toBe(funds - DAILY_RENT - 2 * DAILY_WAGE);
  });

  it('解雇後不再支付', () => {
    const game = new Game({ seed: 1 });
    const r = game.hireStaff();
    if (!r.ok) throw new Error(r.error);
    game.fireStaff(r.value.id);
    runOpenHours(game);
    expect(game.lastReport?.wages).toBe(0);
  });
});

describe('店員補貨', () => {
  it('營業中把倉庫的貨補上架（每格補到容量上限）', () => {
    const { game, fridgeId } = storeWithCola(24, 1);
    game.assignSlot(fridgeId, 0, 'cola');
    game.assignSlot(fridgeId, 1, 'cola');
    runOpenHours(game);
    const cap = FIXTURES.fridge.slotCapacity;
    expect([slotQty(game, fridgeId, 0), slotQty(game, fridgeId, 1)]).toEqual([cap, cap]);
    expect(game.backroomQty('cola')).toBe(24 - 2 * cap);
  });

  it('沒有店員時不會補貨', () => {
    const { game, fridgeId } = storeWithCola(24, 0);
    game.assignSlot(fridgeId, 0, 'cola');
    runOpenHours(game);
    expect(slotQty(game, fridgeId, 0)).toBe(0);
  });

  it('倉庫不夠時補多少算多少', () => {
    const { game, fridgeId } = storeWithCola(12, 1);
    game.assignSlot(fridgeId, 0, 'cola');
    game.assignSlot(fridgeId, 1, 'cola');
    runOpenHours(game);
    expect(slotQty(game, fridgeId, 0) + slotQty(game, fridgeId, 1)).toBe(12);
    expect(game.backroomQty('cola')).toBe(0);
  });

  it('兩位店員不會補同一格', () => {
    const { game, fridgeId } = storeWithCola(12, 2);
    game.assignSlot(fridgeId, 0, 'cola');
    game.openStore();
    let maxClaims = 0;
    while (game.phase === 'open') {
      game.tick(STEP_MS);
      maxClaims = Math.max(maxClaims, game.staffAgents.filter((a) => a.task).length);
    }
    expect(maxClaims).toBe(1);
    expect(slotQty(game, fridgeId, 0)).toBe(FIXTURES.fridge.slotCapacity);
  });

  it('店員從倉庫門出發，沿路走到格位的取用格', () => {
    const { game, fridgeId } = storeWithCola(12, 1);
    game.assignSlot(fridgeId, 3, 'cola');
    game.openStore();
    const agent = game.staffAgents[0]!;
    expect(agent.pos).toEqual({ x: 0, y: 2 });
    while (agent.activity !== 'stocking' && game.phase === 'open') game.tick(STEP_MS);
    // 冷藏櫃 (6,3)–(7,3) 朝南，格位 3 在右半邊 → 取用格 (7,4)
    expect(agent.pos).toEqual({ x: 7, y: 4 });
  });

  it('打烊後店員離開', () => {
    const { game } = storeWithCola(12, 1);
    game.openStore();
    expect(game.staffAgents).toHaveLength(1);
    while (game.phase === 'open') game.tick(STEP_MS * MAX_STEPS_PER_TICK);
    expect(game.staffAgents).toHaveLength(0);
  });
});
