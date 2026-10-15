import { describe, expect, it } from 'vitest';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_IDS } from './agents/demand';
import type { CustomerType } from './agents/demand';
import type { CustomerAgent } from './agents/customer';
import { PRODUCTS } from './catalog/products';
import type { CategoryId } from './catalog/products';
import { STEP_MS } from './clock/clock';
import { Game } from './game';
import type { GameOptions } from './game';
import { playThroughDay, runOpenHours, tickResolving } from './test-helpers';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/** 冷藏櫃 + 兩個貨架（起始三類）+ 收銀台 + 兩位店員，已下充足的進貨（開店時送達）；停在第 1 天準備階段 */
function store(options: Partial<GameOptions> & { seed: number; priceFactor?: number }) {
  const { priceFactor = 1, ...gameOptions } = options;
  const game = new Game({ nuisances: false, ...gameOptions });
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
  game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 120 })));
  for (const productId of STOCKED) {
    const suggested = PRODUCTS.find((p) => p.id === productId)!.suggestedPrice;
    game.setSalePrice(productId, Math.round(suggested * priceFactor));
  }
  game.hireStaff();
  game.hireStaff();
  return game;
}

interface Seen {
  readonly agent: CustomerAgent;
  /** 第一次看到這位顧客的時刻（分鐘） */
  readonly minute: number;
}

/** 逐步跑完第 1 天，收集看得到的顧客與他第一次出現的時刻 */
function customersOnDay1(options: Partial<GameOptions> & { seed: number }): Seen[] {
  const game = store(options);
  const seen = new Map<string, Seen>();
  game.openStore();
  while (game.phase === 'open') {
    tickResolving(game, STEP_MS / game.speed);
    for (const agent of game.customerAgents) {
      if (!seen.has(agent.id)) seen.set(agent.id, { agent, minute: game.minuteOfDay });
    }
  }
  return [...seen.values()];
}

const SEEDS = [1, 2, 3];
const weekday = SEEDS.flatMap((seed) => customersOnDay1({ seed }));
const weekend = SEEDS.flatMap((seed) => customersOnDay1({ seed, testFirstWeekday: 'sat' }));

const share = (list: readonly Seen[], type: CustomerType) =>
  list.filter((s) => s.agent.type === type).length / Math.max(1, list.length);
const between = (list: readonly Seen[], from: number, to: number) =>
  list.filter((s) => s.minute >= from && s.minute < to);

describe('顧客類型（Game）', () => {
  it('每位顧客都帶有類型，三種類型都會出現', () => {
    for (const { agent } of weekday) expect(CUSTOMER_TYPE_IDS).toContain(agent.type);
    for (const type of CUSTOMER_TYPE_IDS) expect(share(weekday, type)).toBeGreaterThan(0.1);
  });

  it('早上與傍晚以上班族為主；放學後學生多於上班族；白天家庭多於早上', () => {
    const morning = between(weekday, 7 * 60 + 30, 9 * 60);
    const evening = between(weekday, 18 * 60, 19 * 60 + 30);
    const afterSchool = between(weekday, 15 * 60 + 30, 17 * 60 + 30);
    const midday = between(weekday, 11 * 60, 15 * 60);
    expect(share(morning, 'office')).toBeGreaterThan(0.6);
    expect(share(evening, 'office')).toBeGreaterThan(0.6);
    expect(share(afterSchool, 'student')).toBeGreaterThan(share(afterSchool, 'office'));
    expect(share(afterSchool, 'student')).toBeGreaterThan(share(morning, 'student') * 2);
    expect(share(midday, 'family')).toBeGreaterThan(share(morning, 'family') * 2);
  });

  it('同種子比較：週末家庭的比例高於平日、上班族的比例低於平日', () => {
    expect(share(weekend, 'family')).toBeGreaterThan(share(weekday, 'family') + 0.08);
    expect(share(weekend, 'office')).toBeLessThan(share(weekday, 'office') - 0.05);
  });

  it('購物清單偏好跟著類型：上班族多飲料、學生多零食與泡麵', () => {
    const has = (type: CustomerType, category: CategoryId) => {
      const lists = weekday.filter((s) => s.agent.type === type).map((s) => s.agent.shoppingList);
      return lists.filter((l) => l.includes(category)).length / lists.length;
    };
    expect(has('office', 'drink')).toBeGreaterThan(has('student', 'drink') + 0.1);
    expect(has('student', 'snack')).toBeGreaterThan(has('office', 'snack') + 0.1);
    expect(has('student', 'noodle')).toBeGreaterThan(has('office', 'noodle') + 0.1);
  });

  it('耐心跟著類型：每位顧客的耐心落在類型的範圍內，上班族平均最短、家庭最長', () => {
    const mean = (type: CustomerType) => {
      const values = weekday.filter((s) => s.agent.type === type).map((s) => s.agent.maxPatience);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(CUSTOMER_TYPES[type].patience[0]);
        expect(v).toBeLessThanOrEqual(CUSTOMER_TYPES[type].patience[1]);
      }
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    expect(mean('office')).toBeLessThan(mean('student'));
    expect(mean('student')).toBeLessThan(mean('family'));
  });

  it('價格敏感度跟著類型：全面貴 40% 時學生都不買，上班族仍有人結帳', () => {
    for (const seed of SEEDS) {
      const game = store({ seed, priceFactor: 1.4 });
      runOpenHours(game);
      const byType = game.lastReport!.customers.byType;
      expect(byType.student.entered).toBeGreaterThan(0);
      expect(byType.student.served).toBe(0);
      expect(byType.office.served).toBeGreaterThan(0);
    }
  });

  it('漲價 15% 時，學生的結帳比例掉得比上班族多（同種子、照建議售價比較，3 個種子合計）', () => {
    const servedRate = (priceFactor: number) => {
      const totals = Object.fromEntries(CUSTOMER_TYPE_IDS.map((t) => [t, { entered: 0, served: 0 }])) as Record<
        CustomerType,
        { entered: number; served: number }
      >;
      for (const seed of SEEDS) {
        const game = store({ seed, priceFactor });
        runOpenHours(game);
        for (const t of CUSTOMER_TYPE_IDS) {
          totals[t].entered += game.lastReport!.customers.byType[t].entered;
          totals[t].served += game.lastReport!.customers.byType[t].served;
        }
      }
      return (t: CustomerType) => totals[t].served / totals[t].entered;
    };
    const normal = servedRate(1);
    const pricey = servedRate(1.15);
    const kept = (t: CustomerType) => pricey(t) / normal(t);
    expect(kept('student')).toBeLessThan(kept('office') - 0.1);
  });
});

describe('每日結算依類型分列', () => {
  it.each([1, 2, 3])('各類型的進店與結帳人數加總等於總來客與結帳人數（種子 %i，連續 5 天）', (seed) => {
    const game = store({ seed });
    for (let day = 0; day < 5; day++) {
      runOpenHours(game);
      const c = game.lastReport!.customers;
      const sum = (key: 'entered' | 'served') => CUSTOMER_TYPE_IDS.reduce((s, t) => s + c.byType[t][key], 0);
      expect(sum('entered')).toBe(c.entered);
      expect(sum('served')).toBe(c.served);
      expect(c.entered).toBeGreaterThan(0);
      for (const t of CUSTOMER_TYPE_IDS) expect(c.byType[t].served).toBeLessThanOrEqual(c.byType[t].entered);
      game.startNextDay();
    }
  });

  it('同種子下結果可重現（類型的抽取用 Game 的種子亂數）', () => {
    const a = store({ seed: 7 });
    const b = store({ seed: 7 });
    playThroughDay(a);
    playThroughDay(b);
    runOpenHours(a);
    runOpenHours(b);
    expect(a.lastReport).toEqual(b.lastReport);
  });
});
