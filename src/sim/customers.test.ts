import { describe, expect, it } from 'vitest';
import { PRODUCTS } from './catalog/products';
import { STEP_MS } from './clock/clock';
import { Game } from './game';
import { totalQty } from './inventory/batch';
import { playThroughDay, runOpenHours } from './test-helpers';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

interface Setup {
  seed?: number;
  staff?: number;
  register?: boolean;
  stock?: boolean;
  priceFactor?: number;
}

/** 冷藏櫃 + 兩個貨架（含三個起始類別）+ 收銀台；第 2 天準備階段，格位已補滿 */
function store({ seed = 1, staff = 2, register = true, stock = true, priceFactor = 1 }: Setup = {}) {
  const game = new Game({ seed });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
  const shelfA = place('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
  const shelfB = place('shelf', { origin: { x: 3, y: 5 }, facing: 'south' });
  if (register) place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  ['cola', 'green-tea', 'cola', 'green-tea'].forEach((p, i) => game.assignSlot(fridge, i, p));
  ['chips', 'chips', 'chocolate', 'chocolate'].forEach((p, i) => game.assignSlot(shelfA, i, p));
  ['cup-noodle', 'cup-noodle', 'bowl-noodle', 'bowl-noodle'].forEach((p, i) => game.assignSlot(shelfB, i, p));
  if (stock) game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 60 })));
  for (const productId of STOCKED) {
    const suggested = PRODUCTS.find((p) => p.id === productId)!.suggestedPrice;
    game.setSalePrice(productId, Math.round(suggested * priceFactor));
  }
  for (let i = 0; i < staff; i++) game.hireStaff();
  // 第 1 天：開幕進貨當天送達，先營業一天
  runOpenHours(game);
  game.startNextDay();
  for (const f of [fridge, shelfA, shelfB]) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
  return { game, displays: [fridge, shelfA, shelfB] };
}

function totalStock(game: Game, displays: string[]) {
  let sum = 0;
  for (const p of STOCKED) sum += game.backroomQty(p);
  for (const f of displays) for (const s of game.slots(f)) sum += totalQty(s.batches);
  return sum;
}

describe('顧客與收銀', () => {
  it('同一種子、同樣的布置重現同一個營業日', () => {
    const a = store({ seed: 42 });
    const b = store({ seed: 42 });
    runOpenHours(a.game);
    runOpenHours(b.game);
    expect(a.game.lastReport).toEqual(b.game.lastReport);
  });

  it('有貨、有收銀台、有店員時會成交，營收進入資金', () => {
    const { game } = store();
    const funds = game.funds;
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.customers.entered).toBeGreaterThan(50);
    expect(r.customers.served).toBeGreaterThan(r.customers.entered * 0.7);
    expect(r.revenue).toBeGreaterThan(0);
    expect(game.funds).toBe(funds + r.revenue - r.rent - r.wages - r.purchases);
  });

  it('每位進店顧客都有結果', () => {
    const { game } = store({ seed: 7 });
    runOpenHours(game);
    const c = game.lastReport!.customers;
    expect(c.served + c.leftEmpty + c.abandoned).toBe(c.entered);
  });

  it('商品不會憑空出現或消失：期初 = 期末 + 賣出', () => {
    const { game, displays } = store({ seed: 3 });
    const before = totalStock(game, displays);
    runOpenHours(game);
    const sold = Object.values(game.lastReport!.sales).reduce((s, n) => s + n, 0);
    expect(totalStock(game, displays) + sold).toBe(before);
  });

  it('架上全空時顧客空手離開', () => {
    const { game } = store({ stock: false });
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.revenue).toBe(0);
    expect(r.customers.leftEmpty).toBe(r.customers.entered);
    expect(r.customers.avgSatisfaction).toBeLessThanOrEqual(30);
  });

  it('沒有店員時沒人收銀，排隊的顧客最終放棄、商品退回', () => {
    const { game, displays } = store({ staff: 0 });
    const before = totalStock(game, displays);
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.revenue).toBe(0);
    expect(r.customers.served).toBe(0);
    expect(r.customers.abandoned).toBeGreaterThan(0);
    expect(totalStock(game, displays)).toBe(before);
  });

  it('沒有收銀台時無法結帳', () => {
    const { game } = store({ register: false });
    runOpenHours(game);
    expect(game.lastReport!.customers.served).toBe(0);
  });

  it('售價貴 50% 以上時沒人買', () => {
    const { game } = store({ priceFactor: 1.6 });
    runOpenHours(game);
    expect(game.lastReport!.revenue).toBe(0);
  });

  it('有人排隊時店員會去收銀台', () => {
    const { game } = store();
    game.openStore();
    let sawCashier = false;
    while (game.phase === 'open' && !sawCashier) {
      game.tick(STEP_MS);
      sawCashier = game.staffAgents.some((s) => s.activity === 'cashier');
    }
    expect(sawCashier).toBe(true);
  });
});

describe('事件', () => {
  it('成交事件的金額加總等於當日營收；打烊時發出 day-ended', () => {
    const { game } = store({ seed: 4 });
    let sales = 0;
    const types = new Set<string>();
    game.onEvent((e) => {
      types.add(e.type);
      if (e.type === 'sale') sales += e.amount;
    });
    runOpenHours(game);
    expect(sales).toBe(game.lastReport!.revenue);
    expect([...types]).toEqual(expect.arrayContaining(['store-opened', 'sale', 'day-ended']));
  });

  it('沒有店員時每位放棄排隊的顧客都發出 abandon', () => {
    const { game } = store({ staff: 0 });
    let abandons = 0;
    game.onEvent((e) => {
      if (e.type === 'abandon') abandons++;
    });
    runOpenHours(game);
    expect(abandons).toBeGreaterThan(0);
    expect(abandons).toBeLessThanOrEqual(game.lastReport!.customers.abandoned);
  });
});

describe('跨日', () => {
  it('連續營業數天不出錯，資金依結算變動', () => {
    const { game } = store({ seed: 11 });
    for (let i = 0; i < 3; i++) {
      const before = game.funds;
      playThroughDay(game);
      const r = game.lastReport!;
      expect(game.funds).toBe(before + r.revenue - r.rent - r.wages - r.purchases);
    }
  });
});
