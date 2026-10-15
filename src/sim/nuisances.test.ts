import { describe, expect, it } from 'vitest';
import { STEP_MS } from './clock/clock';
import { Game, MAX_DISPATCHES } from './game';
import type { DispatchTarget, GameEvent } from './game';
import { NUISANCES } from './nuisances/nuisances';
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

  it('顧客會掉垃圾；同一個種子結果相同', () => {
    const count = () => {
      const { game } = store({ customers: true, seed: 3, staff: 2 });
      runOpenHours(game);
      return game.lastReport!.nuisances.byKind.litter.appeared;
    };
    const n = count();
    expect(n).toBeGreaterThan(0);
    expect(count()).toBe(n);
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
