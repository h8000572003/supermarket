import { describe, expect, it } from 'vitest';
import { productById } from './catalog/products';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { ORDER_CUTOFF_MINUTE, SHIPPING_FEE } from './economy/purchase-order';
import { Game } from './game';
import { playThroughDay, tickResolving } from './test-helpers';

const cost = (productId: string) => productById(productId)!.cost;

/** 第 2 天準備階段的店；沒有顧客也沒有店員，倉庫數量只會因進貨改變 */
function day2() {
  const game = new Game({ seed: 3, customerArrivals: false });
  playThroughDay(game);
  return game;
}

/** 逐步推進營業時段，直到遊戲時刻到達 minute（以一天中的分鐘數表示） */
function tickUntil(game: Game, minute: number) {
  while (game.phase === 'open' && game.minuteOfDay < minute) tickResolving(game, STEP_MS / game.speed);
}

function finishOpenHours(game: Game) {
  while (game.phase === 'open') tickResolving(game, STEP_MS * MAX_STEPS_PER_TICK);
}

const at = (h: number, m = 0) => h * 60 + m;

describe('營業中下一般進貨單（ADR 0005）', () => {
  it('截單時間是 18:00', () => {
    expect(ORDER_CUTOFF_MINUTE).toBe(at(18));
  });

  it('18:00 前下單：立即付款，當天不送達，下一個營業日開店時送達', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(10));
    const funds = game.funds;
    const r = game.submitPurchaseOrder([{ productId: 'cola', qty: 24 }]);
    expect(r.ok && r.value).toMatchObject({ placedDay: 2, deliveryDay: 3 });
    expect(game.funds).toBe(funds - 24 * cost('cola') - SHIPPING_FEE);
    expect(game.pendingOrders).toHaveLength(1);

    finishOpenHours(game);
    expect(game.backroomQty('cola')).toBe(0);
    game.startNextDay();
    expect(game.day).toBe(3);
    expect(game.backroomQty('cola')).toBe(0);
    game.openStore();
    expect(game.backroomQty('cola')).toBe(24);
    expect(game.pendingOrders).toHaveLength(0);
  });

  it('17:59 可下單；18:00 與之後截單', () => {
    const game = day2();
    const lines = [{ productId: 'cola', qty: 12 }];
    game.openStore();
    tickUntil(game, at(17, 59));
    expect(game.minuteOfDay).toBeLessThan(at(18));
    expect(game.submitPurchaseOrder(lines).ok).toBe(true);

    tickUntil(game, at(18));
    const funds = game.funds;
    expect(game.submitPurchaseOrder(lines)).toEqual({ ok: false, error: 'order-cutoff' });
    tickUntil(game, at(22));
    expect(game.submitPurchaseOrder(lines)).toEqual({ ok: false, error: 'order-cutoff' });
    expect(game.funds).toBe(funds);
    expect(game.pendingOrders).toHaveLength(1);
  });

  it('每日結算時不能下單', () => {
    const game = day2();
    game.openStore();
    finishOpenHours(game);
    expect(game.phase).toBe('report');
    expect(game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }])).toEqual({ ok: false, error: 'not-prep-phase' });
  });

  it('同一天可下多張，每張各收一次運費', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(9));
    const funds = game.funds;
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    expect(game.pendingOrders).toHaveLength(2);
    expect(game.funds).toBe(funds - 24 * cost('cola') - 2 * SHIPPING_FEE);
  });

  it('資金不足、低於最低訂購量、未解鎖類別在營業中同樣被拒', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(9));
    const funds = game.funds;
    expect(game.submitPurchaseOrder([{ productId: 'bowl-noodle', qty: 10_000 }])).toEqual({
      ok: false,
      error: 'insufficient-funds',
    });
    expect(game.submitPurchaseOrder([{ productId: 'cola', qty: 5 }])).toEqual({ ok: false, error: 'below-min-order' });
    expect(game.submitPurchaseOrder([{ productId: 'bento', qty: 6 }])).toEqual({ ok: false, error: 'category-locked' });
    expect(game.funds).toBe(funds);
    expect(game.pendingOrders).toHaveLength(0);
  });

  it('第 1 天營業中下的單同樣在下一個營業日開店時才送達', () => {
    const game = new Game({ seed: 3, customerArrivals: false });
    game.openStore();
    tickUntil(game, at(9));
    const r = game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    expect(r.ok && r.value).toMatchObject({ placedDay: 1, deliveryDay: 2 });
    expect(game.backroomQty('cola')).toBe(0);
    finishOpenHours(game);
    game.startNextDay();
    expect(game.backroomQty('cola')).toBe(0);
    game.openStore();
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('營業中下的單計入當天每日結算的進貨支出', () => {
    const game = day2();
    game.openStore();
    tickUntil(game, at(9));
    game.submitPurchaseOrder([{ productId: 'cola', qty: 24 }]);
    finishOpenHours(game);
    expect(game.lastReport!.purchases).toBe(24 * cost('cola') + SHIPPING_FEE);
  });
});
