import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { DAILY_WAGE, Game } from './game';
import type { GameEvent } from './game';
import { INCIDENT_WINDOW } from './incidents/incidents';
import type { IncidentKind, IncidentRecord, PendingIncident } from './incidents/incidents';
import { nextReputation } from './progress/progress';
import { runOpenHours } from './test-helpers';

type Chooser = (incident: PendingIncident) => number;

/** 不花錢的選項 */
const free: Chooser = (i) => i.options.findIndex((o) => o.cost === 0);
const first: Chooser = () => 0;

/** 冷藏櫃 + 收銀台 + staff 位店員，有可樂可賣 */
function store(seed = 1, staff = 2, startingFunds?: number) {
  const game = new Game({ seed, startingFunds });
  if (startingFunds === undefined) {
    const fridge = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    game.placeFixture('register', { origin: { x: 5, y: 7 }, facing: 'west' });
    if (!fridge.ok) throw new Error(fridge.error);
    for (let i = 0; i < 4; i++) game.assignSlot(fridge.value.id, i, 'cola');
    game.submitPurchaseOrder([{ productId: 'cola', qty: 120 }]);
  }
  for (let i = 0; i < staff; i++) game.hireStaff();
  return game;
}

/** 跑完一個營業日並進入下一天；回傳當天處理的狀況 */
function playDay(game: Game, choose: Chooser = free): readonly IncidentRecord[] {
  runOpenHours(game, choose);
  const incidents = game.lastReport!.incidents;
  game.startNextDay();
  return incidents;
}

/** 逐步推進營業時段，直到有狀況等待選擇或打烊 */
function tickUntilIncidentOrClose(game: Game) {
  while (game.phase === 'open' && !game.pendingIncident) game.tick(STEP_MS * MAX_STEPS_PER_TICK);
}

/** 一天天經營，直到某種狀況發生並停在等待選擇；其他狀況以 choose 處理 */
function playUntil(game: Game, kind: IncidentKind, choose: Chooser = free): PendingIncident {
  for (let d = 0; d < 30; d++) {
    if (game.phase === 'prep') game.openStore();
    for (;;) {
      tickUntilIncidentOrClose(game);
      const pending = game.pendingIncident;
      if (!pending) break;
      if (pending.kind === kind) return pending;
      game.resolveIncident(choose(pending));
    }
    game.startNextDay();
  }
  throw new Error(`30 天內沒有發生 ${kind}`);
}

/** 把當天剩下的營業時段跑完 */
function finishDay(game: Game, choose: Chooser = free) {
  for (;;) {
    tickUntilIncidentOrClose(game);
    if (!game.pendingIncident) return;
    game.resolveIncident(choose(game.pendingIncident));
  }
}

describe('狀況的發生', () => {
  it('第 1 天沒有狀況', () => {
    const game = store();
    runOpenHours(game, () => {
      throw new Error('第 1 天不該有狀況');
    });
    expect(game.lastReport!.incidents).toEqual([]);
  });

  it('第 2 天起每天 1–2 個，時刻在 08:00–21:00', () => {
    const game = store();
    playDay(game);
    for (let d = 2; d <= 15; d++) {
      game.openStore();
      const seen: number[] = [];
      for (;;) {
        tickUntilIncidentOrClose(game);
        const pending = game.pendingIncident;
        if (!pending) break;
        expect(game.minuteOfDay).toBeGreaterThanOrEqual(INCIDENT_WINDOW[0]);
        expect(game.minuteOfDay).toBeLessThan(INCIDENT_WINDOW[1] + 1);
        expect(Math.floor(game.minuteOfDay)).toBe(pending.minute);
        seen.push(pending.minute);
        game.resolveIncident(free(pending));
      }
      expect(seen.length).toBeGreaterThanOrEqual(1);
      expect(seen.length).toBeLessThanOrEqual(2);
      expect(game.lastReport!.incidents.map((i) => i.minute)).toEqual(seen);
      game.startNextDay();
    }
  });

  it('同種類狀況不會連續兩天發生', () => {
    const game = store(5);
    let previous: IncidentKind[] = [];
    for (let d = 1; d <= 12; d++) {
      const kinds = playDay(game).map((i) => i.kind);
      for (const k of kinds) expect(previous).not.toContain(k);
      previous = kinds;
    }
  });

  it('沒有店員時不會發生「店員身體不適」', () => {
    const game = store(2, 0);
    const kinds = Array.from({ length: 12 }, () => playDay(game).map((i) => i.kind)).flat();
    expect(kinds).toContain('influencer-visit');
    expect(kinds).not.toContain('staff-sick');
  });

  it('同種子、同選擇下，狀況的種類、時刻、結果完全相同', () => {
    const run = () => {
      const game = store(7);
      const days = Array.from({ length: 8 }, (_, d) => {
        playDay(game, d % 2 === 0 ? first : free);
        return game.lastReport;
      });
      return { days, funds: game.funds, reputation: game.reputation };
    };
    const a = run();
    expect(a.days.flatMap((r) => r!.incidents).length).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });
});

describe('等待選擇時暫停', () => {
  it('tick 不推進遊戲時間；選擇後以原本的速度繼續', () => {
    const game = store();
    game.setSpeed(4);
    const pending = playUntil(game, 'influencer-visit');
    const step = game.step;
    for (let i = 0; i < 50; i++) game.tick(STEP_MS * MAX_STEPS_PER_TICK);
    expect(game.step).toBe(step);
    expect(game.phase).toBe('open');
    expect(game.speed).toBe(4);

    game.resolveIncident(free(pending));
    expect(game.pendingIncident).toBeNull();
    game.tick(STEP_MS * 10);
    expect(game.step).toBe(step + 40);
  });

  it('發出「狀況發生」「狀況已處理」通知', () => {
    const game = store();
    const events: GameEvent[] = [];
    game.onEvent((e) => {
      if (e.type === 'incident-started' || e.type === 'incident-resolved') events.push(e);
    });
    playUntil(game, 'influencer-visit');
    expect(events.at(-1)).toEqual({ type: 'incident-started', kind: 'influencer-visit' });
    game.resolveIncident(0);
    expect(events.at(-1)).toEqual({ type: 'incident-resolved', kind: 'influencer-visit', option: 0 });
  });
});

describe('選擇狀況的選項', () => {
  it('不在營業時段、沒有等待中的狀況或選項不存在時被拒絕', () => {
    const game = store();
    expect(game.resolveIncident(0)).toEqual({ ok: false, error: 'not-open-hours' });
    game.openStore();
    expect(game.resolveIncident(0)).toEqual({ ok: false, error: 'no-pending-incident' });
    playUntil(game, 'influencer-visit');
    expect(game.resolveIncident(2)).toEqual({ ok: false, error: 'invalid-incident-option' });
    expect(game.resolveIncident(-1)).toEqual({ ok: false, error: 'invalid-incident-option' });
    expect(game.pendingIncident).not.toBeNull();
  });

  it('資金不足的選項不可選，選了被拒絕且狀況仍在等待', () => {
    // 只有 1 位店員、沒有設施：第 1 天付完租金與日薪後只剩 $100
    const game = store(1, 1, 1_300);
    playDay(game);
    expect(game.funds).toBe(100);
    game.openStore();
    tickUntilIncidentOrClose(game);
    const pending = game.pendingIncident!;
    expect(pending.options.map((o) => [o.cost > 0, o.available])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(game.resolveIncident(0)).toEqual({ ok: false, error: 'insufficient-funds' });
    expect(game.pendingIncident).toEqual(pending);
    expect(game.resolveIncident(1).ok).toBe(true);
  });

  it('網紅來訪「招待」：付 $200，當天結算口碑額外 +3', () => {
    const game = store();
    const pending = playUntil(game, 'influencer-visit');
    expect(pending.options[0]).toMatchObject({ label: '招待', cost: 200, available: true });
    const funds = game.funds;
    const r = game.resolveIncident(0);
    expect(r.ok && r.value).toMatchObject({ kind: 'influencer-visit', option: 0, cost: 200 });
    expect(game.funds).toBe(funds - 200);
    finishDay(game);
    const report = game.lastReport!;
    const base = nextReputation(report.progress.reputationBefore, report.customers.avgSatisfaction);
    expect(report.progress.reputationAfter).toBeCloseTo(base + 3);
    expect(game.reputation).toBe(report.progress.reputationAfter);
  });

  it('網紅來訪「不理會」：不花錢，當天結算口碑額外 −1', () => {
    const game = store();
    playUntil(game, 'influencer-visit');
    const funds = game.funds;
    game.resolveIncident(1);
    expect(game.funds).toBe(funds);
    finishDay(game);
    const report = game.lastReport!;
    const base = nextReputation(report.progress.reputationBefore, report.customers.avgSatisfaction);
    expect(report.progress.reputationAfter).toBeCloseTo(base - 1);
  });

  it('店員身體不適「加給」：付 $300，人手不變', () => {
    const game = store();
    const pending = playUntil(game, 'staff-sick');
    expect(pending.options[0]).toMatchObject({ cost: 300, available: true });
    const funds = game.funds;
    game.resolveIncident(0);
    expect(game.funds).toBe(funds - 300);
    expect(game.staffAgents).toHaveLength(2);
    finishDay(game);
    expect(game.lastReport!.wages).toBe(2 * DAILY_WAGE);
  });

  it('店員身體不適「提早下班」：今天剩下的時間少一人、日薪照付；隔天恢復', () => {
    const game = store();
    playUntil(game, 'staff-sick');
    const funds = game.funds;
    const before = colaInStore(game);
    game.resolveIncident(1);
    expect(game.funds).toBe(funds);
    expect(game.staffAgents).toHaveLength(1);
    // 下班的店員手上的貨退回倉庫，不會憑空消失
    expect(colaInStore(game)).toBe(before);
    while (game.phase === 'open') {
      game.tick(STEP_MS * MAX_STEPS_PER_TICK);
      if (game.phase === 'open') expect(game.staffAgents.length).toBeLessThanOrEqual(1);
      if (game.pendingIncident) game.resolveIncident(free(game.pendingIncident));
    }
    expect(game.lastReport!.wages).toBe(2 * DAILY_WAGE);
    game.startNextDay();
    game.openStore();
    expect(game.staffAgents).toHaveLength(2);
  });
});

/** 倉庫、格位與店員手上的可樂總數 */
function colaInStore(game: Game): number {
  const qty = (batches: readonly { qty: number }[]) => batches.reduce((n, b) => n + b.qty, 0);
  const onShelf = game.fixtures.flatMap((f) => game.slots(f.id)).reduce((s, slot) => s + qty(slot.batches), 0);
  const carried = game.staffAgents.reduce((s, a) => s + qty(a.carrying), 0);
  return game.backroomQty('cola') + onShelf + carried;
}

describe('每日結算', () => {
  it('「今日狀況」與「狀況支出」與當天的選擇一致，且收支對得起來', () => {
    const game = store(3);
    for (let d = 1; d <= 6; d++) {
      runOpenHours(game, first);
      const r = game.lastReport!;
      for (const i of r.incidents) expect(i.option).toBe(0);
      expect(r.incidentCosts).toBe(r.incidents.reduce((s, i) => s + i.cost, 0));
      expect(r.fundsAtEnd - r.fundsAtStart).toBe(
        r.revenue - r.purchases - r.fixtures - r.rent - r.wages - r.incidentCosts,
      );
      game.startNextDay();
    }
  });

  it('記錄名稱、時刻與所選選項', () => {
    const game = store();
    const pending = playUntil(game, 'influencer-visit');
    game.resolveIncident(1);
    finishDay(game);
    expect(game.lastReport!.incidents).toContainEqual({
      kind: 'influencer-visit',
      name: '網紅來訪',
      minute: pending.minute,
      option: 1,
      optionLabel: '不理會',
      cost: 0,
    });
  });
});
