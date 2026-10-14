import { describe, expect, it } from 'vitest';
import { productById } from './catalog/products';
import { STEP_MS } from './clock/clock';
import { SHIPPING_FEE } from './economy/purchase-order';
import { RUSH_ORDERS_PER_DAY, freeRushTerms } from './economy/rush-order';
import { Game } from './game';
import { totalQty } from './inventory/batch';
import type { GameEvent } from './game';
import { playThroughDay, runOpenHours, tickResolving } from './test-helpers';

const cost = (productId: string) => productById(productId)!.cost;

/** 第 2 天準備階段的店；預設沒有顧客也沒有店員，倉庫數量只會因緊急叫貨改變 */
function day2({ customers = false, staff = 0 } = {}) {
  const game = new Game({ seed: 3, customerArrivals: customers });
  for (let i = 0; i < staff; i++) game.hireStaff();
  playThroughDay(game);
  return game;
}

/** 逐步推進營業時段，直到遊戲時刻到達 minute（以一天中的分鐘數表示） */
function tickUntil(game: Game, minute: number) {
  while (game.phase === 'open' && game.minuteOfDay < minute) tickResolving(game, STEP_MS / game.speed);
}

const at = (h: number, m = 0) => h * 60 + m;

describe('緊急叫貨', () => {
  it('準備階段被拒；營業中可用', () => {
    const game = day2();
    const lines = [{ productId: 'cola', qty: 12 }];
    expect(game.placeRushOrder(lines)).toEqual({ ok: false, error: 'not-open-hours' });
    expect(game.rushOrders).toHaveLength(0);

    game.openStore();
    tickUntil(game, at(9));
    const r = game.placeRushOrder(lines);
    expect(r.ok).toBe(true);
    expect(game.rushOrders).toHaveLength(1);
  });

  it('下單時扣除商品成本加兩倍運費', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(9));
    const funds = game.funds;
    const r = game.placeRushOrder([
      { productId: 'cola', qty: 12 },
      { productId: 'chips', qty: 6 },
    ]);
    const goods = 12 * cost('cola') + 6 * cost('chips');
    expect(r.ok && r.value).toMatchObject({ goods, shipping: 2 * SHIPPING_FEE, total: goods + 2 * SHIPPING_FEE });
    expect(game.funds).toBe(funds - goods - 2 * SHIPPING_FEE);
  });

  it('下單 2 遊戲小時後送達倉庫，並發出送達通知', () => {
    const game = day2();
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.openStore();
    tickUntil(game, at(10));
    const r = game.placeRushOrder([{ productId: 'cola', qty: 12 }]);
    expect(r.ok && r.value.etaMinute).toBe(at(12));
    expect(game.rushOrders[0]?.etaMinute).toBe(at(12));

    tickUntil(game, at(11, 59));
    expect(game.backroomQty('cola')).toBe(0);
    expect(events.some((e) => e.type === 'rush-delivered')).toBe(false);

    tickUntil(game, at(12));
    expect(game.backroomQty('cola')).toBe(12);
    expect(game.rushOrders).toHaveLength(0);
    expect(events.filter((e) => e.type === 'rush-delivered')).toEqual([
      { type: 'rush-delivered', lines: [{ productId: 'cola', qty: 12 }] },
    ]);
  });

  it('送達後店員照常補上架', () => {
    const game = day2({ staff: 1 });
    const fridge = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    if (!fridge.ok) throw new Error(fridge.error);
    game.assignSlot(fridge.value.id, 0, 'cola');
    game.openStore();
    tickUntil(game, at(9));
    game.placeRushOrder([{ productId: 'cola', qty: 12 }]);
    tickUntil(game, at(13));
    const onShelf = totalQty(game.slots(fridge.value.id)[0]!.batches);
    expect(onShelf).toBeGreaterThan(0);
    expect(onShelf + game.backroomQty('cola')).toBe(12);
  });

  it('每天 1 次；隔天恢復', () => {
    const game = day2();
    game.openStore();
    expect(game.rushOrdersLeftToday).toBe(RUSH_ORDERS_PER_DAY);
    expect(game.placeRushOrder([{ productId: 'cola', qty: 12 }]).ok).toBe(true);
    expect(game.rushOrdersLeftToday).toBe(0);
    const funds = game.funds;
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }])).toEqual({ ok: false, error: 'rush-limit-reached' });
    expect(game.funds).toBe(funds);

    runToNextDayOpen(game);
    expect(game.rushOrdersLeftToday).toBe(1);
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }]).ok).toBe(true);
  });

  it('22:00 之後被拒', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(21, 59));
    expect(game.placeRushOrder([{ productId: 'cola', qty: 12 }]).ok).toBe(true);

    runToNextDayOpen(game);
    tickUntil(game, at(22));
    expect(game.placeRushOrder([{ productId: 'cola', qty: 12 }])).toEqual({ ok: false, error: 'rush-too-late' });
    expect(game.rushOrdersLeftToday).toBe(1);
  });

  it('資金不足被拒且不扣款', () => {
    const game = day2();
    game.openStore();
    const funds = game.funds;
    const r = game.placeRushOrder([{ productId: 'bowl-noodle', qty: 10_000 }]);
    expect(r).toEqual({ ok: false, error: 'insufficient-funds' });
    expect(game.funds).toBe(funds);
    expect(game.rushOrdersLeftToday).toBe(1);
  });

  it('低於最低訂購量、空單、未解鎖類別被拒', () => {
    const game = day2();
    game.openStore();
    expect(game.placeRushOrder([{ productId: 'cola', qty: 5 }])).toEqual({ ok: false, error: 'below-min-order' });
    expect(game.placeRushOrder([{ productId: 'cola', qty: 0 }])).toEqual({ ok: false, error: 'empty-order' });
    expect(game.placeRushOrder([{ productId: 'bento', qty: 6 }])).toEqual({ ok: false, error: 'category-locked' });
    expect(game.rushOrdersLeftToday).toBe(1);
  });

  it('打烊前未送達者轉為一般待送達進貨，於下一個營業日開店時送達', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(21, 30));
    game.placeRushOrder([{ productId: 'cola', qty: 12 }]);
    finishOpenHours(game);
    expect(game.backroomQty('cola')).toBe(0);
    expect(game.rushOrders).toHaveLength(0);
    expect(game.pendingOrders.flatMap((o) => o.lines)).toEqual([{ productId: 'cola', qty: 12 }]);
    expect(game.pendingOrders[0]!.deliveryDay).toBe(game.day + 1);

    // 打烊後的準備階段（前一晚）還沒送到，隔天開店時送達
    game.startNextDay();
    expect(game.backroomQty('cola')).toBe(0);
    expect(game.pendingOrders).toHaveLength(1);
    game.openStore();
    expect(game.backroomQty('cola')).toBe(12);
    expect(game.pendingOrders).toHaveLength(0);
  });

  it('鮮食：營業中送達的批次以當天為送達日', () => {
    const game = day2();
    game.unlockCategory('fresh');
    game.openStore();
    tickUntil(game, at(9));
    game.placeRushOrder([{ productId: 'rice-ball', qty: 6 }]);
    finishOpenHours(game);
    game.startNextDay();
    expect(game.snapshot()!.inventory.backroom.filter((b) => b.productId === 'rice-ball')).toEqual([
      { productId: 'rice-ball', qty: 6, arrivedDay: 2 },
    ]);
  });

  it('鮮食：打烊前未送達的批次以下一個營業日為送達日', () => {
    const game = day2();
    game.unlockCategory('fresh');
    game.openStore();
    tickUntil(game, at(21, 30));
    game.placeRushOrder([{ productId: 'sandwich', qty: 6 }]);
    finishOpenHours(game);
    game.startNextDay();
    expect(game.backroomQty('sandwich')).toBe(0);
    // 第 3 天開店時送達；快照只在準備階段可讀，跑完第 3 天再看（沒有店員與顧客，倉庫不變）
    game.openStore();
    expect(game.backroomQty('sandwich')).toBe(6);
    finishOpenHours(game);
    game.startNextDay();
    expect(game.snapshot()!.inventory.backroom.filter((b) => b.productId === 'sandwich')).toEqual([
      { productId: 'sandwich', qty: 6, arrivedDay: 3 },
    ]);
  });

  it('每日結算另列緊急叫貨運費，商品成本併入進貨支出', () => {
    const game = day2();
    game.submitPurchaseOrder([{ productId: 'chips', qty: 6 }]);
    game.openStore();
    tickUntil(game, at(9));
    game.placeRushOrder([{ productId: 'cola', qty: 12 }]);
    finishOpenHours(game);
    const report = game.lastReport!;
    expect(report.rushShipping).toBe(2 * SHIPPING_FEE);
    expect(report.purchases).toBe(6 * cost('chips') + SHIPPING_FEE + 12 * cost('cola'));
    expect(report.fundsAtEnd - report.fundsAtStart).toBe(
      report.revenue + report.goalFunds - report.purchases - report.rushShipping - report.fixtures - report.rent - report.wages - report.incidentCosts,
    );
  });

  it('沒有緊急叫貨的日子運費為 0', () => {
    const game = day2();
    runOpenHours(game);
    expect(game.lastReport!.rushShipping).toBe(0);
  });

  it('同一種子、同樣的緊急叫貨重現同一個營業日', () => {
    const play = () => {
      const game = day2({ customers: true, staff: 1 });
      game.openStore();
      tickUntil(game, at(12));
      game.placeRushOrder([{ productId: 'cola', qty: 12 }]);
      finishOpenHours(game);
      return game.lastReport;
    };
    expect(play()).toEqual(play());
  });
});

describe('狀況用的緊急叫貨條件', () => {
  it('免運費、不佔每日次數、只限指定類別', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(9));
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }], freeRushTerms('drink'))).toEqual({
      ok: false,
      error: 'wrong-category',
    });
    const funds = game.funds;
    const r = game.placeRushOrder([{ productId: 'cola', qty: 12 }], freeRushTerms('drink'));
    expect(r.ok && r.value.shipping).toBe(0);
    expect(game.funds).toBe(funds - 12 * cost('cola'));
    expect(game.rushOrdersLeftToday).toBe(1);
    expect(game.placeRushOrder([{ productId: 'chips', qty: 6 }]).ok).toBe(true);
    finishOpenHours(game);
    expect(game.lastReport!.rushShipping).toBe(2 * SHIPPING_FEE);
  });
});

/** 從營業中跑到打烊（停在每日結算） */
function finishOpenHours(game: Game) {
  while (game.phase === 'open') tickResolving(game, STEP_MS * 200);
}

/** 從營業中跑完當天，進入下一天並開店 */
function runToNextDayOpen(game: Game) {
  finishOpenHours(game);
  game.startNextDay();
  game.openStore();
}
