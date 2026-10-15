import { describe, expect, it } from 'vitest';
import { MINUTES_PER_STEP, STEP_MS } from './clock/clock';
import { Game, MAX_DISPATCHES } from './game';
import type { DispatchTarget, GameEvent } from './game';
import {
  MAX_LITTER,
  NUISANCES,
  TROUBLEMAKER_NEARBY_PENALTY,
  TROUBLEMAKER_STAY_MINUTES,
  scheduleNuisances,
} from './nuisances/nuisances';
import { Rng } from './rng';
import { finishOpenHours, playThroughDay, runOpenHours, tickResolving } from './test-helpers';

/** 冷藏櫃一個、收銀台一台；第 1 天準備階段 */
function store({ staff = 1, customers = false, seed = 1 }: { staff?: number; customers?: boolean; seed?: number } = {}) {
  const game = new Game({ seed, customerArrivals: customers });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 6, y: 3 }, facing: 'south' });
  const register = place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  for (let i = 0; i < 4; i++) game.assignSlot(fridge, i, 'cola');
  game.submitPurchaseOrder([{ productId: 'cola', qty: 48 }]);
  for (let i = 0; i < staff; i++) game.hireStaff();
  return { game, fridge, register };
}

const target = (nuisanceId: string): DispatchTarget => ({ kind: 'nuisance', nuisanceId });

function stepUntil(game: Game, done: () => boolean): void {
  while (game.phase === 'open' && !done()) tickResolving(game, STEP_MS);
}

function stepFor(game: Game, steps: number): void {
  for (let i = 0; i < steps && game.phase === 'open'; i++) tickResolving(game, STEP_MS);
}

function litter(game: Game, tile = { x: 2, y: 6 }): string {
  const id = game.placeNuisance('litter', tile);
  if (!id) throw new Error('not open');
  return id;
}

describe('麻煩：垃圾與派工', () => {
  it('準備階段不能放麻煩；營業中放下的垃圾出現在清單裡', () => {
    const { game } = store();
    expect(game.placeNuisance('litter', { x: 2, y: 6 })).toBeNull();
    game.openStore();
    const id = litter(game);
    expect(game.nuisances.map((n) => [n.id, n.kind, n.tile])).toEqual([[id, 'litter', { x: 2, y: 6 }]]);
  });

  it('沒有派工時，店員不會去清垃圾；打烊時垃圾消失', () => {
    const { game } = store();
    game.openStore();
    litter(game);
    stepFor(game, 600);
    expect(game.nuisances).toHaveLength(1);
    expect(game.staffAgents.every((s) => s.nuisanceId === null)).toBe(true);
    finishOpenHours(game);
    expect(game.nuisances).toEqual([]);
    expect(game.dispatches).toEqual([]);
  });

  it('對垃圾派工：店員走過去清掉，標記清除，店員恢復自動工作', () => {
    const { game } = store();
    const events: GameEvent[] = [];
    game.onEvent((e) => events.push(e));
    game.openStore();
    const id = litter(game);
    expect(game.dispatch(target(id)).ok).toBe(true);
    stepUntil(game, () => game.nuisances.length === 0);
    expect(game.phase).toBe('open');
    expect(events).toContainEqual({ type: 'nuisance-handled', kind: 'litter', id });
    stepFor(game, 1);
    expect(game.dispatches).toEqual([]);
    const staff = game.staffAgents[0]!;
    expect(staff.nuisanceId).toBeNull();
    expect(staff.onDispatch).toBe(false);
  });

  it('處理時店員站在垃圾旁邊，處理需要一段時間', () => {
    const { game } = store();
    game.openStore();
    const id = litter(game);
    game.dispatch(target(id));
    stepUntil(game, () => game.staffAgents[0]?.activity === 'handling');
    const staff = game.staffAgents[0]!;
    expect(Math.abs(staff.pos.x - 2) + Math.abs(staff.pos.y - 6)).toBeLessThanOrEqual(1);
    expect(game.nuisances).toHaveLength(1);
    stepFor(game, 1);
    expect(game.nuisances).toHaveLength(1);
  });

  it('派工名額與格位、收銀台共用：滿了再派麻煩回傳 dispatch-full', () => {
    const { game, register } = store();
    game.openStore();
    const ids = [litter(game, { x: 2, y: 6 }), litter(game, { x: 3, y: 6 })];
    expect(game.dispatch({ kind: 'register', registerId: register }).ok).toBe(true);
    expect(game.dispatch(target(ids[0]!)).ok).toBe(true);
    expect(game.dispatches).toHaveLength(MAX_DISPATCHES);
    expect(game.dispatch(target(ids[1]!))).toEqual({ ok: false, error: 'dispatch-full' });
    expect(game.dispatch(target(ids[0]!))).toEqual({ ok: false, error: 'already-dispatched' });
  });

  it('對不存在的麻煩派工被拒', () => {
    const { game } = store();
    game.openStore();
    expect(game.dispatch(target('n999'))).toEqual({ ok: false, error: 'unknown-nuisance' });
  });

  it('取消對麻煩的派工：店員放下工作，垃圾留著', () => {
    const { game } = store();
    game.openStore();
    const id = litter(game);
    game.dispatch(target(id));
    stepFor(game, 3);
    expect(game.staffAgents[0]?.nuisanceId).toBe(id);
    expect(game.cancelDispatch(target(id)).ok).toBe(true);
    expect(game.staffAgents[0]?.nuisanceId).toBeNull();
    stepFor(game, 300);
    expect(game.nuisances).toHaveLength(1);
  });

  it('收銀中的店員被派去清垃圾：離開收銀台，清完後恢復自動工作', () => {
    const { game, register } = store();
    game.openStore();
    game.dispatch({ kind: 'register', registerId: register });
    stepUntil(game, () => game.staffAgents[0]?.activity === 'cashier');
    const id = litter(game);
    expect(game.dispatch(target(id)).ok).toBe(true);
    stepFor(game, 1);
    const staff = game.staffAgents[0]!;
    expect(staff.registerId).toBeNull();
    expect(staff.nuisanceId).toBe(id);
    stepUntil(game, () => game.nuisances.length === 0);
    expect(game.phase).toBe('open');
  });

  it('在場的麻煩讓來客速率乘上倍率，多個疊乘；處理掉就恢復', () => {
    // 同樣布置、沒有麻煩的店同步推進，當作同一時刻的基準
    const { game } = store();
    const { game: plain } = store();
    game.openStore();
    plain.openStore();
    const ratio = () => game.arrivalsPerHourNow / plain.arrivalsPerHourNow;
    const a = litter(game, { x: 2, y: 6 });
    expect(ratio()).toBeCloseTo(NUISANCES.litter.arrivalMultiplier);
    litter(game, { x: 3, y: 6 });
    expect(ratio()).toBeCloseTo(NUISANCES.litter.arrivalMultiplier ** 2);
    game.dispatch(target(a));
    while (game.nuisances.length > 1) {
      tickResolving(game, STEP_MS);
      tickResolving(plain, STEP_MS);
    }
    expect(game.minuteOfDay).toBe(plain.minuteOfDay);
    expect(ratio()).toBeCloseTo(NUISANCES.litter.arrivalMultiplier);
  });

  it('與麻煩同時在場的顧客扣一次滿意度；麻煩消失後進店的顧客不受影響', () => {
    const { game } = store({ customers: true, seed: 7 });
    game.openStore();
    stepUntil(game, () => game.customerAgents.some((c) => c.rating));
    const early = game.customerAgents.find((c) => c.rating)!;
    const id = litter(game);
    stepFor(game, 5);
    expect(early.nuisancePenalty).toBe(NUISANCES.litter.satisfactionPenalty);
    stepFor(game, 5);
    // 同一個麻煩只扣一次
    expect(early.nuisancePenalty).toBe(NUISANCES.litter.satisfactionPenalty);
    game.dispatch(target(id));
    stepUntil(game, () => !game.nuisances.some((n) => n.id === id));
    const seen = new Set(game.customerAgents.map((c) => c.id));
    stepUntil(game, () => game.customerAgents.some((c) => !seen.has(c.id)));
    const late = game.customerAgents.find((c) => !seen.has(c.id))!;
    stepFor(game, 3);
    // 晚到的顧客只受到現在還在場的垃圾影響（之後掉下的也算），已清掉的那個不算
    expect(game.nuisances.some((n) => n.id === id)).toBe(false);
    expect(late.nuisancePenalty).toBe(game.nuisances.length * NUISANCES.litter.satisfactionPenalty);
  });

  it('第 1 天不掉垃圾；第 2 天起顧客會掉垃圾，同一個種子結果相同', () => {
    const play = () => {
      const { game } = store({ customers: true, seed: 3, staff: 2 });
      const perDay: number[] = [];
      for (let d = 0; d < 6; d++) {
        if (d > 0) game.submitPurchaseOrder([{ productId: 'cola', qty: 24 }]);
        runOpenHours(game);
        perDay.push(game.lastReport!.nuisances.byKind.litter.appeared);
        game.startNextDay();
      }
      return perDay;
    };
    const perDay = play();
    expect(perDay[0]).toBe(0);
    expect(perDay.slice(1).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(play()).toEqual(perDay);
  });

  it(`地上已有 ${MAX_LITTER} 個垃圾時，顧客不再掉新的`, () => {
    const { game } = store({ customers: true, seed: 3, staff: 0 });
    playThroughDay(game);
    game.openStore();
    for (let i = 0; i < MAX_LITTER; i++) litter(game, { x: 1 + i, y: 8 });
    finishOpenHours(game);
    expect(game.lastReport!.nuisances.byKind.litter.appeared).toBe(MAX_LITTER);
  });

  it('每日結算記下出現數、處理數與累計在場時間', () => {
    const { game } = store();
    game.openStore();
    const a = litter(game, { x: 2, y: 6 });
    litter(game, { x: 3, y: 6 });
    game.dispatch(target(a));
    stepUntil(game, () => game.nuisances.length === 1);
    finishOpenHours(game);
    const summary = game.lastReport!.nuisances;
    expect(summary.byKind.litter).toEqual({ appeared: 2, handled: 1 });
    // 沒處理的那個從開店在場到打烊（16 小時）
    expect(summary.minutes).toBeGreaterThanOrEqual(16 * 60);
    expect(summary.minutes).toBeLessThan(17 * 60);
  });

  it('麻煩不存檔：打烊後的快照讀回來照常營業', () => {
    const { game } = store();
    game.openStore();
    litter(game);
    finishOpenHours(game);
    game.startNextDay();
    const restored = Game.fromSnapshot(game.snapshot()!, { customerArrivals: false });
    expect(restored.openStore().ok).toBe(true);
    expect(restored.nuisances).toEqual([]);
  });

  it('玩完幾天沒有錯誤', () => {
    const { game } = store({ customers: true, staff: 2 });
    for (let i = 0; i < 3; i++) playThroughDay(game);
    expect(game.day).toBe(4);
  });
});

describe('麻煩的排程', () => {
  it('第 1、2 天不排老鼠與奧客；第 3 天起每種每天最多 1 次，時刻在 08:00–20:00', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(scheduleNuisances(Rng.fromSeed(seed), 1)).toEqual([]);
      expect(scheduleNuisances(Rng.fromSeed(seed), 2)).toEqual([]);
      const day3 = scheduleNuisances(Rng.fromSeed(seed), 3);
      for (const kind of ['rat', 'troublemaker'] as const) {
        expect(day3.filter((s) => s.kind === kind).length).toBeLessThanOrEqual(1);
      }
      for (const s of day3) {
        expect(s.minute).toBeGreaterThanOrEqual(8 * 60);
        expect(s.minute).toBeLessThanOrEqual(20 * 60);
      }
    }
    const all = Array.from({ length: 50 }, (_, i) => scheduleNuisances(Rng.fromSeed(i + 1), 3)).flat();
    expect(all.some((s) => s.kind === 'rat')).toBe(true);
    expect(all.some((s) => s.kind === 'troublemaker')).toBe(true);
  });

  it('實際經營：前兩天沒有老鼠與奧客，之後每天各最多 1 次', () => {
    const { game } = store({ customers: true, staff: 2, seed: 5 });
    const days: { rat: number; troublemaker: number }[] = [];
    for (let d = 0; d < 10; d++) {
      runOpenHours(game);
      const k = game.lastReport!.nuisances.byKind;
      days.push({ rat: k.rat.appeared, troublemaker: k.troublemaker.appeared });
      game.startNextDay();
    }
    expect(days.slice(0, 2)).toEqual([
      { rat: 0, troublemaker: 0 },
      { rat: 0, troublemaker: 0 },
    ]);
    for (const d of days) {
      expect(d.rat).toBeLessThanOrEqual(1);
      expect(d.troublemaker).toBeLessThanOrEqual(1);
    }
    expect(days.some((d) => d.rat === 1)).toBe(true);
    expect(days.some((d) => d.troublemaker === 1)).toBe(true);
  });
});

describe('麻煩：老鼠', () => {
  it('老鼠在店內走動，不會自己離開，也不碰陳列庫存', () => {
    const { game, fridge } = store({ staff: 0 });
    game.openStore();
    game.restockSlot(fridge, 0);
    const before = game.slots(fridge)[0]!.batches.reduce((s, b) => s + b.qty, 0);
    const id = game.placeNuisance('rat', { x: 2, y: 6 })!;
    const tiles = new Set<string>();
    for (let i = 0; i < 600; i++) {
      tickResolving(game, STEP_MS);
      const rat = game.nuisances.find((n) => n.id === id)!;
      tiles.add(`${rat.tile.x},${rat.tile.y}`);
    }
    expect(tiles.size).toBeGreaterThan(3);
    expect(game.nuisances.map((n) => n.id)).toEqual([id]);
    expect(game.slots(fridge)[0]!.batches.reduce((s, b) => s + b.qty, 0)).toBe(before);
  });

  it('店員追到移動中的老鼠並抓到', () => {
    const { game } = store();
    game.openStore();
    const id = game.placeNuisance('rat', { x: 9, y: 7 })!;
    stepFor(game, 50);
    game.dispatch(target(id));
    stepUntil(game, () => game.nuisances.length === 0);
    expect(game.phase).toBe('open');
    finishOpenHours(game);
    expect(game.lastReport!.nuisances.byKind.rat).toEqual({ appeared: 1, handled: 1 });
  });

  it('老鼠在場時來客速率 ×0.8', () => {
    const { game } = store();
    const { game: plain } = store();
    game.openStore();
    plain.openStore();
    game.placeNuisance('rat', { x: 2, y: 6 });
    expect(game.arrivalsPerHourNow / plain.arrivalsPerHourNow).toBeCloseTo(0.8);
  });
});

describe('麻煩：奧客', () => {
  const stay = Math.round(TROUBLEMAKER_STAY_MINUTES / MINUTES_PER_STEP);

  it('奧客不算顧客：不計入進店人數', () => {
    const { game } = store();
    game.openStore();
    game.placeNuisance('troublemaker', { x: 6, y: 9 });
    expect(game.customerAgents).toEqual([]);
    finishOpenHours(game);
    expect(game.lastReport!.customers.entered).toBe(0);
    expect(game.lastReport!.nuisances.byKind.troublemaker.appeared).toBe(1);
  });

  it('在奧客附近的顧客再多扣一次滿意度', () => {
    const { game } = store({ customers: true, seed: 7 });
    game.openStore();
    stepUntil(game, () => game.customerAgents.some((c) => c.rating));
    const c = game.customerAgents.find((x) => x.rating)!;
    game.placeNuisance('troublemaker', c.tile);
    stepFor(game, 1);
    expect(c.nuisancePenalty).toBe(NUISANCES.troublemaker.satisfactionPenalty + TROUBLEMAKER_NEARBY_PENALTY);
  });

  it('沒人勸離：待一段時間後自己走向入口離開，離店途中不再算在場', () => {
    const { game } = store({ staff: 0 });
    const { game: plain } = store({ staff: 0 });
    game.openStore();
    plain.openStore();
    const id = game.placeNuisance('troublemaker', { x: 3, y: 3 })!;
    const ratio = () => game.arrivalsPerHourNow / plain.arrivalsPerHourNow;
    const both = (n: number) => {
      for (let i = 0; i < n; i++) {
        tickResolving(game, STEP_MS);
        tickResolving(plain, STEP_MS);
      }
    };
    both(stay - 5);
    expect(ratio()).toBeCloseTo(NUISANCES.troublemaker.arrivalMultiplier);
    both(10);
    const tm = game.nuisances.find((n) => n.id === id)!;
    expect(tm.leaving).toBe(true);
    expect(ratio()).toBeCloseTo(1);
    expect(game.dispatch(target(id))).toEqual({ ok: false, error: 'unknown-nuisance' });
    stepUntil(game, () => game.nuisances.length === 0);
    expect(game.phase).toBe('open');
    finishOpenHours(game);
    const summary = game.lastReport!.nuisances;
    expect(summary.byKind.troublemaker).toEqual({ appeared: 1, handled: 0 });
    expect(summary.minutes).toBeCloseTo(TROUBLEMAKER_STAY_MINUTES, -1);
  });

  it('派店員勸離：處理完後提早離開，標記清除', () => {
    const { game } = store();
    game.openStore();
    const id = game.placeNuisance('troublemaker', { x: 3, y: 5 })!;
    game.dispatch(target(id));
    stepUntil(game, () => game.nuisances.every((n) => n.leaving));
    expect(game.step).toBeLessThan(stay);
    stepFor(game, 1);
    expect(game.dispatches).toEqual([]);
    expect(game.staffAgents[0]!.nuisanceId).toBeNull();
    finishOpenHours(game);
    expect(game.lastReport!.nuisances.byKind.troublemaker).toEqual({ appeared: 1, handled: 1 });
  });
});
