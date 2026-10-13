import { describe, expect, it } from 'vitest';
import { STEP_MS } from './clock/clock';
import { Game } from './game';
import type { GameEvent } from './game';
import { FLASH_SALE_MINUTES, MAX_FLASH_SALES } from './economy/flash-sale';
import { playThroughDay, runOpenHours, tickResolving } from './test-helpers';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/** 冷藏櫃 + 兩個貨架 + 收銀台、兩位店員；第 2 天準備階段，格位已補滿（同 customers.test.ts） */
function store(seed = 1) {
  const game = new Game({ seed });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
  const shelfA = place('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
  const shelfB = place('shelf', { origin: { x: 3, y: 5 }, facing: 'south' });
  place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  ['cola', 'green-tea', 'cola', 'green-tea'].forEach((p, i) => game.assignSlot(fridge, i, p));
  ['chips', 'chips', 'chocolate', 'chocolate'].forEach((p, i) => game.assignSlot(shelfA, i, p));
  ['cup-noodle', 'cup-noodle', 'bowl-noodle', 'bowl-noodle'].forEach((p, i) => game.assignSlot(shelfB, i, p));
  game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 60 })));
  game.hireStaff();
  game.hireStaff();
  runOpenHours(game);
  game.startNextDay();
  for (const f of [fridge, shelfA, shelfB]) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
  return game;
}

/** 以 1x 逐步推進到指定的遊戲時刻（一天中的分鐘數） */
function tickUntil(game: Game, minute: number) {
  while (game.phase === 'open' && game.minuteOfDay < minute) tickResolving(game, STEP_MS);
}

/** 營業時段跑完（不重新開店），停在每日結算 */
function finishDay(game: Game) {
  while (game.phase === 'open') tickResolving(game, STEP_MS * 100);
}

function startOk(game: Game, productId: string, tier: number) {
  const r = game.startFlashSale(productId, tier);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('限時特價', () => {
  it('準備階段開始限時特價被拒；營業中可用', () => {
    const game = store();
    expect(game.startFlashSale('cola', 0.8)).toEqual({ ok: false, error: 'not-open-hours' });
    expect(game.flashSales).toEqual([]);
    game.openStore();
    const sale = startOk(game, 'cola', 0.8);
    expect(sale).toMatchObject({ productId: 'cola', tier: 0.8, price: 24, remainingMinutes: FLASH_SALE_MINUTES });
    expect(game.flashSales).toHaveLength(1);
    expect(game.currentPrice('cola')).toBe(24);
    // 售價本身不變
    expect(game.salePrice('cola')).toBe(30);
  });

  it('只能選 9 折、8 折、7 折；商品需存在且已解鎖', () => {
    const game = store();
    game.openStore();
    expect(game.startFlashSale('cola', 0.5)).toEqual({ ok: false, error: 'invalid-discount' });
    expect(game.startFlashSale('cola', 1)).toEqual({ ok: false, error: 'invalid-discount' });
    expect(game.startFlashSale('nope', 0.9)).toEqual({ ok: false, error: 'unknown-product' });
    expect(game.isUnlocked('fresh')).toBe(false);
    expect(game.startFlashSale('rice-ball', 0.9)).toEqual({ ok: false, error: 'category-locked' });
    expect(game.startFlashSale('cola', 0.9).ok).toBe(true);
    expect(game.startFlashSale('chips', 0.7).ok).toBe(true);
  });

  it('第 3 個同時進行的特價被拒；同一商品進行中重複開被拒', () => {
    const game = store();
    game.openStore();
    startOk(game, 'cola', 0.9);
    expect(game.startFlashSale('cola', 0.7)).toEqual({ ok: false, error: 'flash-sale-active' });
    startOk(game, 'chips', 0.8);
    expect(MAX_FLASH_SALES).toBe(2);
    expect(game.startFlashSale('chocolate', 0.7)).toEqual({ ok: false, error: 'flash-sale-limit' });
    expect(game.flashSales.map((s) => s.productId)).toEqual(['cola', 'chips']);
  });

  it('剩餘時間隨遊戲時間減少；2 遊戲小時後自動恢復售價並發出結束通知，之後可再開', () => {
    const game = store();
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.openStore();
    tickUntil(game, 10 * 60);
    startOk(game, 'cola', 0.7);
    expect(events).toContainEqual({ type: 'flash-sale-started', productId: 'cola', tier: 0.7, price: 21 });
    expect(game.flashSales[0]!.endsAtMinute).toBeCloseTo(12 * 60);

    tickUntil(game, 11 * 60);
    expect(game.flashSales[0]!.remainingMinutes).toBeCloseTo(60);
    expect(events.some((e) => e.type === 'flash-sale-ended')).toBe(false);

    tickUntil(game, 12 * 60 - 1);
    expect(game.currentPrice('cola')).toBe(21);
    tickUntil(game, 12 * 60);
    expect(game.flashSales).toEqual([]);
    expect(game.currentPrice('cola')).toBe(30);
    expect(events).toContainEqual({ type: 'flash-sale-ended', productId: 'cola' });

    startOk(game, 'cola', 0.9);
    expect(game.currentPrice('cola')).toBe(27);
  });

  it('特價期間成交價為折扣價，營收照實際成交價計算', () => {
    const run = (withSale: boolean) => {
      const game = store(5);
      const amounts: number[] = [];
      game.onEvent((e) => {
        if (e.type === 'sale') amounts.push(e.amount);
      });
      game.openStore();
      if (withSale) startOk(game, 'cola', 0.8);
      finishDay(game);
      return { report: game.lastReport!, amounts };
    };
    const full = run(false);
    const sale = run(true);
    // 價格不高於建議售價時顧客必買，兩家店的顧客行為相同
    expect(sale.report.sales).toEqual(full.report.sales);
    expect(sale.amounts).toHaveLength(full.amounts.length);
    // 每筆成交的差額都是可樂折扣（$30 → $24）的整數倍
    const diffs = full.amounts.map((a, i) => a - sale.amounts[i]!);
    for (const d of diffs) expect(d % 6).toBe(0);
    expect(diffs.filter((d) => d > 0).length).toBeGreaterThan(0);
    // 營收等於實際成交金額的總和
    expect(sale.report.revenue).toBe(sale.amounts.reduce((s, a) => s + a, 0));
    expect(sale.report.revenue).toBeLessThan(full.report.revenue);
  });

  it('特價商品的成交套用折扣加分：特價時段的顧客滿意度較高', () => {
    const run = (withSale: boolean) => {
      const game = store(3);
      game.openStore();
      tickUntil(game, 11 * 60);
      if (withSale) {
        startOk(game, 'cola', 0.7);
        startOk(game, 'chips', 0.7);
      }
      finishDay(game);
      return game.lastReport!.customers.avgSatisfaction!;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('打烊時所有特價結束；隔天準備階段售價等於原本設定、沒有殘留的特價', () => {
    const game = store();
    game.setSalePrice('cola', 28);
    game.openStore();
    tickUntil(game, 22 * 60);
    startOk(game, 'cola', 0.8);
    startOk(game, 'chips', 0.9);
    finishDay(game);
    expect(game.phase).toBe('report');
    expect(game.flashSales).toEqual([]);
    expect(game.salePrice('cola')).toBe(28);
    expect(game.currentPrice('cola')).toBe(28);
    game.startNextDay();
    expect(game.flashSales).toEqual([]);
    expect(game.currentPrice('cola')).toBe(28);
    expect(game.snapshot()!.salePrices).toContainEqual(['cola', 28]);
  });

  it('每日結算的類別銷量標示當天曾特價；隔天沒有特價就不標示', () => {
    const game = store();
    game.openStore();
    startOk(game, 'chips', 0.8);
    finishDay(game);
    expect(game.lastReport!.flashSaleCategories).toEqual(['snack']);
    game.startNextDay();
    playThroughDay(game);
    expect(game.lastReport!.flashSaleCategories).toEqual([]);
  });
});
