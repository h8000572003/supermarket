import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_TICK, OPEN_HOURS_REAL_MS, OPEN_MINUTE, STEP_MS, STEPS_PER_DAY } from './clock/clock';
import { productById } from './catalog/products';
import { DAILY_RENT, Game, STARTING_FUNDS } from './game';
import { playThroughDay, runOpenHours } from './test-helpers';

const newGame = () => new Game({ seed: 1 });

describe('營業日循環', () => {
  it('準備階段 → 營業時段 → 每日結算 → 下一天準備階段', () => {
    const game = newGame();
    expect([game.phase, game.day]).toEqual(['prep', 1]);
    game.openStore();
    expect(game.phase).toBe('open');
    runUntilClosed(game);
    expect(game.phase).toBe('report');
    game.startNextDay();
    expect([game.phase, game.day]).toEqual(['prep', 2]);
  });

  it('只能在準備階段開店、只能在每日結算進入下一天', () => {
    const game = newGame();
    expect(game.startNextDay()).toEqual({ ok: false, error: 'not-report-phase' });
    game.openStore();
    expect(game.openStore()).toEqual({ ok: false, error: 'not-prep-phase' });
  });

  it('營業時段與每日結算時，店長的指令都被拒絕', () => {
    const game = newGame();
    const r = game.placeFixture('fridge', { origin: { x: 2, y: 2 }, facing: 'south' });
    if (!r.ok) throw new Error(r.error);
    const id = r.value.id;
    const attempts = () => [
      game.placeFixture('shelf', { origin: { x: 6, y: 4 }, facing: 'south' }),
      game.rotateFixture(id),
      game.sellFixture(id),
      game.assignSlot(id, 0, 'cola'),
      game.setSalePrice('cola', 40),
      game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]),
    ];

    game.openStore();
    for (const a of attempts()) expect(a).toEqual({ ok: false, error: 'not-prep-phase' });
    runUntilClosed(game);
    for (const a of attempts()) expect(a).toEqual({ ok: false, error: 'not-prep-phase' });
  });
});

describe('時鐘', () => {
  it('1x 倍速下約 4 分鐘跑完營業時段', () => {
    const game = newGame();
    game.openStore();
    advanceReal(game, OPEN_HOURS_REAL_MS - STEP_MS);
    expect(game.phase).toBe('open');
    advanceReal(game, STEP_MS);
    expect(game.phase).toBe('report');
  });

  it('4x 倍速只需四分之一的現實時間', () => {
    const game = newGame();
    game.openStore();
    game.setSpeed(4);
    advanceReal(game, OPEN_HOURS_REAL_MS / 4);
    expect(game.phase).toBe('report');
  });

  it('暫停時時間不前進', () => {
    const game = newGame();
    game.openStore();
    game.setSpeed(0);
    advanceReal(game, 60_000);
    expect(game.step).toBe(0);
  });

  it('時刻從 07:00 開始，一半時是 15:00', () => {
    const game = newGame();
    expect(game.minuteOfDay).toBe(OPEN_MINUTE);
    game.openStore();
    advanceReal(game, (STEPS_PER_DAY / 2) * STEP_MS);
    expect(game.minuteOfDay).toBe(15 * 60);
  });

  it('單次 tick 有步數上限（分頁休眠後不會一次跑完一天）', () => {
    const game = newGame();
    game.openStore();
    game.tick(10 * 60 * 1000);
    expect(game.step).toBe(MAX_STEPS_PER_TICK);
  });
});

describe('每日結算與固定支出', () => {
  it('打烊時支付租金，結算記錄資金與進貨支出', () => {
    const game = newGame();
    const order = game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    if (!order.ok) throw new Error(order.error);
    runOpenHours(game);
    expect(game.funds).toBe(STARTING_FUNDS - order.value.total - DAILY_RENT);
    expect(game.lastReport).toMatchObject({
      day: 1,
      fundsAtStart: STARTING_FUNDS,
      fundsAtEnd: game.funds,
      purchases: order.value.total,
      rent: DAILY_RENT,
    });
  });
});

describe('結算對帳', () => {
  it('各項收支加總等於資金變化（含設施購置與出售回收）', () => {
    const game = newGame();
    const fridge = game.placeFixture('fridge', { origin: { x: 2, y: 2 }, facing: 'south' });
    const shelf = game.placeFixture('shelf', { origin: { x: 6, y: 4 }, facing: 'south' });
    game.placeFixture('register', { origin: { x: 5, y: 7 }, facing: 'west' });
    if (!fridge.ok || !shelf.ok) throw new Error('setup');
    game.sellFixture(shelf.value.id);
    game.hireStaff();
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.fixtures).toBe(4_000 + 3_000 + 2_000 - 1_000);
    expect(r.fundsAtEnd - r.fundsAtStart).toBe(r.revenue - r.purchases - r.fixtures - r.rent - r.wages);
  });
});

describe('鮮食報廢', () => {
  function withRiceBalls() {
    const game = new Game({ seed: 1, customerArrivals: false });
    game.unlockCategory('fresh');
    const fridge = game.placeFixture('fridge', { origin: { x: 2, y: 2 }, facing: 'south' });
    if (!fridge.ok) throw new Error(fridge.error);
    game.submitPurchaseOrder([
      { productId: 'rice-ball', qty: 12 },
      { productId: 'cola', qty: 12 },
    ]);
    // 第 1 天的開幕進貨當天送達
    game.assignSlot(fridge.value.id, 0, 'rice-ball');
    game.restockSlot(fridge.value.id, 0); // 架上 10、倉庫 2
    return { game, fridgeId: fridge.value.id };
  }

  it('保存期限 2 天：第 1 天送達，第 2 天仍可販售', () => {
    const { game, fridgeId } = withRiceBalls();
    playThroughDay(game);
    expect(game.day).toBe(2);
    expect(game.backroomQty('rice-ball')).toBe(2);
    expect(game.slots(fridgeId)[0]?.batches).toEqual([{ productId: 'rice-ball', qty: 10, arrivedDay: 1 }]);
    expect(game.todayWaste).toEqual([]);
  });

  it('第 3 天開始時，倉庫與格位上的過期品都被報廢', () => {
    const { game, fridgeId } = withRiceBalls();
    playThroughDay(game);
    playThroughDay(game);
    expect(game.backroomQty('rice-ball')).toBe(0);
    expect(game.slots(fridgeId)[0]).toEqual({ productId: 'rice-ball', batches: [] });
    expect(game.todayWaste).toEqual([{ productId: 'rice-ball', qty: 12, cost: 12 * productById('rice-ball')!.cost }]);
  });

  it('非鮮食不會過期', () => {
    const { game } = withRiceBalls();
    for (let i = 0; i < 5; i++) playThroughDay(game);
    expect(game.backroomQty('cola')).toBe(12);
  });
});

function advanceReal(game: Game, ms: number) {
  for (let t = 0; t < ms; t += STEP_MS) game.tick(STEP_MS);
}

function runUntilClosed(game: Game) {
  while (game.phase === 'open') game.tick(STEP_MS * MAX_STEPS_PER_TICK);
}
