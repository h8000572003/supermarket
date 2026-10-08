import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { productById } from './catalog/products';
import { SHIPPING_FEE } from './economy/purchase-order';
import { Game, STARTING_FUNDS } from './game';
import { playThroughDay } from './test-helpers';

function setup() {
  const game = new Game({ seed: 1 });
  const shelf = game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
  const fridge = game.placeFixture('fridge', { origin: { x: 6, y: 2 }, facing: 'south' });
  if (!shelf.ok || !fridge.ok) throw new Error('setup failed');
  return { game, shelfId: shelf.value.id, fridgeId: fridge.value.id };
}

describe('進貨單', () => {
  it('下單立即扣款（含運費），隔天送達倉庫', () => {
    const game = new Game({ seed: 1 });
    const r = game.submitPurchaseOrder([{ productId: 'cola', qty: 24 }]);
    expect(r.ok).toBe(true);
    expect(game.funds).toBe(STARTING_FUNDS - 24 * productById('cola')!.cost - SHIPPING_FEE);
    expect(game.backroomQty('cola')).toBe(0);
    expect(game.pendingOrders).toHaveLength(1);

    playThroughDay(game);
    expect(game.day).toBe(2);
    expect(game.backroomQty('cola')).toBe(24);
    expect(game.pendingOrders).toHaveLength(0);
  });

  it('低於最低訂購量被拒', () => {
    const r = new Game({ seed: 1 }).submitPurchaseOrder([{ productId: 'cola', qty: 5 }]);
    expect(r).toEqual({ ok: false, error: 'below-min-order' });
  });

  it('未解鎖類別不能進貨', () => {
    const r = new Game({ seed: 1 }).submitPurchaseOrder([{ productId: 'bento', qty: 6 }]);
    expect(r).toEqual({ ok: false, error: 'category-locked' });
  });

  it('空單被拒；數量 0 的品項被忽略', () => {
    const game = new Game({ seed: 1 });
    expect(game.submitPurchaseOrder([{ productId: 'cola', qty: 0 }])).toEqual({ ok: false, error: 'empty-order' });
    const r = game.submitPurchaseOrder([
      { productId: 'cola', qty: 0 },
      { productId: 'chips', qty: 6 },
    ]);
    expect(r.ok && r.value.lines).toEqual([{ productId: 'chips', qty: 6 }]);
  });

  it('資金不足被拒且不扣款', () => {
    const game = new Game({ seed: 1 });
    const r = game.submitPurchaseOrder([{ productId: 'bowl-noodle', qty: 10_000 }]);
    expect(r).toEqual({ ok: false, error: 'insufficient-funds' });
    expect(game.funds).toBe(STARTING_FUNDS);
  });
});

describe('格位', () => {
  it('陳列櫃依定義建立格位', () => {
    const { game, shelfId, fridgeId } = setup();
    expect(game.slots(shelfId)).toHaveLength(FIXTURES.shelf.slots);
    expect(game.slots(fridgeId)).toHaveLength(FIXTURES.fridge.slots);
  });

  it('飲料只能放冷藏櫃、零食只能放一般貨架', () => {
    const { game, shelfId, fridgeId } = setup();
    expect(game.assignSlot(shelfId, 0, 'cola')).toEqual({ ok: false, error: 'wrong-display' });
    expect(game.assignSlot(fridgeId, 0, 'chips')).toEqual({ ok: false, error: 'wrong-display' });
    expect(game.assignSlot(fridgeId, 0, 'cola').ok).toBe(true);
    expect(game.assignSlot(shelfId, 0, 'chips').ok).toBe(true);
  });

  it('收銀台沒有格位', () => {
    const game = new Game({ seed: 1 });
    const r = game.placeFixture('register', { origin: { x: 4, y: 4 }, facing: 'south' });
    if (!r.ok) throw new Error(r.error);
    expect(game.assignSlot(r.value.id, 0, 'chips')).toEqual({ ok: false, error: 'invalid-slot' });
  });

  it('補貨以先進先出從倉庫補到容量上限', () => {
    const { game, fridgeId } = setup();
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    playThroughDay(game); // 第 2 天送達 12
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    playThroughDay(game); // 第 3 天送達 12
    game.assignSlot(fridgeId, 0, 'cola');

    expect(game.restockSlot(fridgeId, 0)).toBe(FIXTURES.fridge.slotCapacity);
    const slot = game.slots(fridgeId)[0]!;
    expect(slot.batches).toEqual([{ productId: 'cola', qty: 10, arrivedDay: 2 }]);
    expect(game.backroomQty('cola')).toBe(14);
  });

  it('改指定其他商品時，原本的陳列庫存退回倉庫', () => {
    const { game, fridgeId } = setup();
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    playThroughDay(game);
    game.assignSlot(fridgeId, 0, 'cola');
    game.restockSlot(fridgeId, 0);
    game.assignSlot(fridgeId, 0, 'water');
    expect(game.backroomQty('cola')).toBe(12);
    expect(game.slots(fridgeId)[0]).toEqual({ productId: 'water', batches: [] });
  });

  it('出售陳列櫃時，陳列庫存退回倉庫', () => {
    const { game, fridgeId } = setup();
    game.submitPurchaseOrder([{ productId: 'cola', qty: 12 }]);
    playThroughDay(game);
    game.assignSlot(fridgeId, 0, 'cola');
    game.restockSlot(fridgeId, 0);
    game.sellFixture(fridgeId);
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('移動陳列櫃保留陳列庫存', () => {
    const { game, shelfId } = setup();
    game.submitPurchaseOrder([{ productId: 'chips', qty: 6 }]);
    playThroughDay(game);
    game.assignSlot(shelfId, 1, 'chips');
    game.restockSlot(shelfId, 1);
    game.moveFixture(shelfId, { origin: { x: 2, y: 6 }, facing: 'north' });
    expect(game.slots(shelfId)[1]?.batches).toEqual([{ productId: 'chips', qty: 6, arrivedDay: 2 }]);
  });
});

describe('售價', () => {
  it('預設為建議售價，可調整為正整數', () => {
    const game = new Game({ seed: 1 });
    expect(game.salePrice('cola')).toBe(productById('cola')!.suggestedPrice);
    expect(game.setSalePrice('cola', 35).ok).toBe(true);
    expect(game.salePrice('cola')).toBe(35);
    expect(game.setSalePrice('cola', 0)).toEqual({ ok: false, error: 'invalid-price' });
    expect(game.setSalePrice('cola', 12.5)).toEqual({ ok: false, error: 'invalid-price' });
  });
});
