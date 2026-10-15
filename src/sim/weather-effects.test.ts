import { describe, expect, it } from 'vitest';
import { WEATHER_DEMAND, arrivalsPerHour, conditionsArrivalMultiplier } from './agents/demand';
import type { CategoryId } from './catalog/products';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { Game } from './game';
import type { GameOptions } from './game';
import type { IncidentKind } from './incidents/incidents';
import { arrivalMultiplier } from './progress/progress';
import { playThroughDay, runOpenHours, tickResolving } from './test-helpers';
import type { Weather } from './weather/weather';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/**
 * 冷藏櫃 + 兩個貨架（起始三類）+ 收銀台 + 兩位店員，已下充足的進貨（開店時送達）；停在第 1 天準備階段。
 * 第 1 天沒有狀況，適合在同種子下只改天氣或星期來比較。
 */
function store(options: Partial<GameOptions> & { seed: number }) {
  const game = new Game({ nuisances: false, ...options });
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
  game.hireStaff();
  game.hireStaff();
  return game;
}

/** 第 1 天的進店人數 */
function enteredOnDay1(options: Partial<GameOptions> & { seed: number }): number {
  const game = store(options);
  runOpenHours(game);
  return game.lastReport!.customers.entered;
}

/** 逐步跑完第 1 天，收集進店顧客的購物清單 */
function shoppingListsOnDay1(seed: number, weather: Weather): (readonly CategoryId[])[] {
  const game = store({ seed, testWeather: [weather] });
  const lists = new Map<string, readonly CategoryId[]>();
  game.openStore();
  while (game.phase === 'open') {
    tickResolving(game, STEP_MS / game.speed);
    for (const c of game.customerAgents) lists.set(c.id, c.shoppingList);
  }
  // 找不到任何想買的類別的顧客在進店的同一步就離開，看不到他的清單；其餘都收得到
  expect(lists.size).toBeGreaterThan(game.lastReport!.customers.entered * 0.9);
  return [...lists.values()];
}

/** 幾個種子合計：購物清單含該類別的比例 */
function listShareOver(seeds: readonly number[], weather: Weather) {
  const lists = seeds.flatMap((seed) => shoppingListsOnDay1(seed, weather));
  return (category: CategoryId) => lists.filter((l) => l.includes(category)).length / lists.length;
}

describe('天氣與星期影響來客', () => {
  it('測試用的天氣與星期設定反映在今天的狀態', () => {
    expect(new Game({ nuisances: false, seed: 1, testWeather: ['rainy'] }).today).toMatchObject({ weather: 'rainy', weekday: 'mon' });
    expect(new Game({ nuisances: false, seed: 1, testFirstWeekday: 'sat' }).today).toMatchObject({
      weather: 'sunny',
      weekday: 'sat',
      weekend: true,
    });
  });

  it('來客速率 = 時段曲線 × 口碑倍率 × 天氣與星期倍率', () => {
    const rate = (options: Partial<GameOptions>) => {
      const game = store({ seed: 1, ...options });
      game.openStore();
      return { game, rate: game.arrivalsPerHourNow };
    };
    const sunny = rate({});
    expect(sunny.rate).toBeCloseTo(arrivalsPerHour(sunny.game.minuteOfDay) * arrivalMultiplier(sunny.game.reputation));
    expect(rate({ testWeather: ['rainy'] }).rate).toBeCloseTo(sunny.rate * 0.75);
    // 週末的時段曲線不同（家庭多、上班族少；整天總量相同），再乘週末倍率
    const weekendCurve = (game: Game) => arrivalsPerHour(game.minuteOfDay, true) * arrivalMultiplier(game.reputation);
    const sat = rate({ testFirstWeekday: 'sat' });
    expect(sat.rate).toBeCloseTo(weekendCurve(sat.game) * 1.2);
    const rainySun = rate({ testWeather: ['rainy'], testFirstWeekday: 'sun' });
    expect(rainySun.rate).toBeCloseTo(weekendCurve(rainySun.game) * 0.9);
    // 熱與冷只改類別需求，不改來客
    expect(rate({ testWeather: ['hot'] }).rate).toBeCloseTo(sunny.rate);
    expect(rate({ testWeather: ['cold'] }).rate).toBeCloseTo(sunny.rate);
  });

  it.each([1, 2, 3])('同種子比較：雨天來客少於晴天（種子 %i）', (seed) => {
    const sunny = enteredOnDay1({ seed, testWeather: ['sunny'] });
    const rainy = enteredOnDay1({ seed, testWeather: ['rainy'] });
    expect(rainy).toBeLessThan(sunny * 0.9);
  });

  it.each([1, 2, 3])('同種子比較：週末來客多於平日（種子 %i）', (seed) => {
    const weekday = enteredOnDay1({ seed });
    const weekend = enteredOnDay1({ seed, testFirstWeekday: 'sat' });
    expect(weekend).toBeGreaterThan(weekday * 1.08);
  });

  it('不指定測試設定時，進入營業時段的來客速率跟著今天的天氣與星期', () => {
    const game = new Game({ nuisances: false, seed: 4, customerArrivals: false });
    for (let d = 0; d < 10; d++) {
      game.openStore();
      const expected =
        arrivalsPerHour(game.minuteOfDay, game.today.weekend) *
        arrivalMultiplier(game.reputation) *
        conditionsArrivalMultiplier(game.today);
      expect(game.arrivalsPerHourNow).toBeCloseTo(expected);
      while (game.phase === 'open') tickResolving(game, STEP_MS * MAX_STEPS_PER_TICK);
      game.startNextDay();
    }
  });
});

describe('天氣影響購物清單的類別', () => {
  it('今天的類別需求倍率跟著天氣：熱天飲料 ×2、泡麵 ×0.5；冷天泡麵 ×2、飲料 ×0.6', () => {
    const multipliers = (weather: Weather) => {
      const game = new Game({ nuisances: false, seed: 1, testWeather: [weather] });
      const m = (c: CategoryId) => game.demandMultiplier(c);
      return { drink: m('drink'), noodle: m('noodle'), snack: m('snack') };
    };
    expect(multipliers('sunny')).toEqual({ drink: 1, noodle: 1, snack: 1 });
    expect(multipliers('rainy')).toEqual({ drink: 1, noodle: 1, snack: 1 });
    expect(multipliers('hot')).toEqual({ drink: 2, noodle: 0.5, snack: 1 });
    expect(multipliers('cold')).toEqual({ drink: 0.6, noodle: 2, snack: 1 });
  });

  it('同種子比較：熱天購物清單出現飲料的比例提高、泡麵降低；冷天相反', () => {
    // 期望差距約 0.11（見 listShare）；多取幾個種子以降低抽樣誤差
    const seeds = [1, 2, 3, 4, 5, 6];
    const sunny = listShareOver(seeds, 'sunny');
    const hot = listShareOver(seeds, 'hot');
    const cold = listShareOver(seeds, 'cold');
    expect(hot('drink')).toBeGreaterThan(sunny('drink'));
    expect(hot('noodle')).toBeLessThan(sunny('noodle') - 0.1);
    expect(cold('noodle')).toBeGreaterThan(sunny('noodle') + 0.1);
    expect(cold('drink')).toBeLessThan(sunny('drink') - 0.05);
  });

  it('熱天賣出的飲料多於晴天、泡麵少於晴天（同種子）', () => {
    const sold = (weather: Weather) => {
      const game = store({ seed: 2, testWeather: [weather] });
      runOpenHours(game);
      const s = game.lastReport!.sales;
      return {
        drink: (s['cola'] ?? 0) + (s['green-tea'] ?? 0),
        noodle: (s['cup-noodle'] ?? 0) + (s['bowl-noodle'] ?? 0),
      };
    };
    const sunny = sold('sunny');
    const hot = sold('hot');
    const cold = sold('cold');
    expect(hot.drink).toBeGreaterThan(sunny.drink);
    expect(hot.noodle).toBeLessThan(sunny.noodle);
    expect(cold.noodle).toBeGreaterThan(sunny.noodle);
    expect(cold.drink).toBeLessThan(sunny.drink);
  });
});

describe('狀況「熱浪」與天氣', () => {
  /** 只有一個放飲料的冷藏櫃、沒有顧客：快速經營 days 天，回傳每天的天氣與發生的狀況 */
  function incidentDays(options: Partial<GameOptions> & { seed: number }, days: number) {
    const game = new Game({ nuisances: false, ...options, customerArrivals: false });
    const f = game.placeFixture('fridge', { origin: { x: 1, y: 0 }, facing: 'south' });
    if (!f.ok) throw new Error(f.error);
    game.assignSlot(f.value.id, 0, 'cola');
    const rows: { weather: Weather; kinds: IncidentKind[] }[] = [];
    for (let d = 0; d < days; d++) {
      const weather = game.today.weather;
      playThroughDay(game);
      rows.push({ weather, kinds: game.lastReport!.incidents.map((i) => i.kind) });
    }
    return rows;
  }

  it('熱天不會發生熱浪；同種子的晴天會發生', () => {
    for (const seed of [1, 2, 3]) {
      const hot = incidentDays({ seed, testWeather: Array(25).fill('hot') }, 25);
      expect(hot.flatMap((r) => r.kinds).length).toBeGreaterThan(0);
      expect(hot.flatMap((r) => r.kinds)).not.toContain('heat-wave');
      const sunny = incidentDays({ seed, testWeather: Array(25).fill('sunny') }, 25);
      expect(sunny.flatMap((r) => r.kinds)).toContain('heat-wave');
    }
  });

  it('一般天氣下，熱浪只出現在不是熱天的日子', () => {
    let heatWaves = 0;
    let hotDays = 0;
    for (const seed of [1, 2, 3, 4]) {
      for (const row of incidentDays({ seed }, 30)) {
        if (row.weather === 'hot') hotDays++;
        if (row.kinds.includes('heat-wave')) {
          heatWaves++;
          expect(row.weather).not.toBe('hot');
        }
      }
    }
    expect(hotDays).toBeGreaterThan(0);
    expect(heatWaves).toBeGreaterThan(0);
  });

  it('冷天遇上熱浪：飲料需求倍率與天氣相乘（0.6 × 2）', () => {
    const game = new Game({ nuisances: false, seed: 1, customerArrivals: false, testWeather: Array(40).fill('cold') });
    const f = game.placeFixture('fridge', { origin: { x: 1, y: 0 }, facing: 'south' });
    if (!f.ok) throw new Error(f.error);
    game.assignSlot(f.value.id, 0, 'cola');
    for (let d = 0; d < 40; d++) {
      game.openStore();
      while (game.phase === 'open') {
        const pending = game.pendingIncident;
        if (pending?.kind === 'heat-wave') {
          expect(game.demandMultiplier('drink')).toBeCloseTo(WEATHER_DEMAND.cold.drink!);
          expect(game.resolveIncident(1).ok).toBe(true);
          expect(game.demandMultiplier('drink')).toBeCloseTo(WEATHER_DEMAND.cold.drink! * 2);
          expect(game.demandMultiplier('noodle')).toBe(2);
          return;
        }
        tickResolving(game, STEP_MS * 10, (i) => i.options.findIndex((o) => o.cost === 0));
      }
      game.startNextDay();
    }
    throw new Error('40 天內沒有發生熱浪');
  });
});
