import { describe, expect, it } from 'vitest';
import type { CategoryId } from './catalog/products';
import { productById } from './catalog/products';
import { MAX_STEPS_PER_TICK, STEP_MS } from './clock/clock';
import { Game } from './game';
import { MAX_FUNDS_REWARD, MIN_FUNDS_REWARD, REPUTATION_REWARD } from './goals/daily-goal';
import type { DailyGoalResult } from './goals/daily-goal';
import { nextReputation } from './progress/progress';
import type { DailyReport } from './report/daily-report';
import { calmOption, playThroughDay, runOpenHours, tickResolving } from './test-helpers';
import type { IncidentChooser } from './test-helpers';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/** 照 calmOption 選，並記下當天是否選了會改變口碑的選項（這種天的口碑不只來自滿意度與每日目標） */
function trackingReputation() {
  const tracker = {
    touched: false,
    choose: ((incident, game) => {
      const i = calmOption(incident, game);
      if (incident.options[i]!.effects.some((e) => e.type === 'reputation')) tracker.touched = true;
      return i;
    }) as IncidentChooser,
  };
  return tracker;
}

/** 飲料、零食、泡麵都有陳列的店；每天下單補貨、開店前把格位補滿 */
function stockedStore(
  seed: number,
  options: { customerArrivals?: boolean; startingFunds?: number; orderQty?: number } = {},
) {
  const { orderQty = 36, ...gameOptions } = options;
  const game = new Game({ seed, ...gameOptions });
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
  game.hireStaff();
  game.hireStaff();
  const displays = [fridge, shelfA, shelfB];
  const prepare = () => {
    if (game.backroomQty('cola') < 60)
      game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: orderQty })));
    for (const f of displays) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
  };
  prepare();
  /** 跑完今天、停在每日結算 */
  const close = (choose: IncidentChooser = calmOption): DailyReport => {
    runOpenHours(game, choose);
    return game.lastReport!;
  };
  /** 進入下一天的準備階段並補貨 */
  const next = () => {
    game.startNextDay();
    prepare();
  };
  return { game, close, next };
}

const categorySold = (report: DailyReport, category: CategoryId) =>
  Object.entries(report.sales)
    .filter(([id]) => productById(id)?.category === category)
    .reduce((s, [, n]) => s + n, 0);

describe('每日目標的出現', () => {
  it('第 1 天沒有每日目標；第 2 天起每天恰好一個，整天不變', () => {
    for (const seed of [1, 2, 3]) {
      const { game, close, next } = stockedStore(seed);
      expect(game.dailyGoal).toBeNull();
      runOpenHours(game);
      expect(game.lastReport!.dailyGoal).toBeNull();
      expect(game.lastReport!.goalFunds).toBe(0);
      next();
      for (let day = 2; day <= 8; day++) {
        expect(game.day).toBe(day);
        const goal = game.dailyGoal;
        expect(goal).not.toBeNull();
        expect(goal!.description.length).toBeGreaterThan(0);
        const report = close();
        const { kind, target, category } = report.dailyGoal!;
        expect({ kind, target, category }).toEqual({
          kind: goal!.kind,
          target: goal!.target,
          category: goal!.category,
        });
        expect(game.dailyGoal).toEqual(report.dailyGoal);
        next();
      }
    }
  });

  it('目標只涉及已解鎖且有陳列的類別', () => {
    // 冷藏櫃只放可樂、貨架只放洋芋片；鮮食與日用品已解鎖但沒有陳列，泡麵沒有陳列
    const game = new Game({ seed: 11 });
    const fridge = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    const shelf = game.placeFixture('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
    game.placeFixture('register', { origin: { x: 5, y: 7 }, facing: 'west' });
    if (!fridge.ok || !shelf.ok) throw new Error('setup');
    game.unlockCategory('fresh');
    game.unlockCategory('daily');
    for (let i = 0; i < 4; i++) game.assignSlot(fridge.value.id, i, 'cola');
    for (let i = 0; i < 4; i++) game.assignSlot(shelf.value.id, i, 'chips');
    game.hireStaff();
    const seen = new Set<CategoryId>();
    for (let day = 1; day <= 30; day++) {
      if (game.backroomQty('cola') < 60) {
        game.submitPurchaseOrder([
          { productId: 'cola', qty: 96 },
          { productId: 'chips', qty: 60 },
        ]);
      }
      const goal = game.dailyGoal;
      if (goal?.category) seen.add(goal.category);
      playThroughDay(game);
    }
    expect([...seen].sort()).toEqual(['drink', 'snack']);
  });

  it('熱天出現飲料銷量目標的機會比其他天氣高', () => {
    const tally = { hot: { drink: 0, days: 0 }, other: { drink: 0, days: 0 } };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { game, next } = stockedStore(seed, { customerArrivals: false, startingFunds: 1_000_000 });
      runOpenHours(game);
      next();
      for (let day = 2; day <= 30; day++) {
        const bucket = game.today.weather === 'hot' ? tally.hot : tally.other;
        bucket.days++;
        if (game.dailyGoal?.kind === 'sell-category' && game.dailyGoal.category === 'drink') bucket.drink++;
        runOpenHours(game);
        next();
      }
    }
    expect(tally.hot.days).toBeGreaterThan(10);
    const hotRate = tally.hot.drink / tally.hot.days;
    const otherRate = tally.other.drink / tally.other.days;
    expect(hotRate).toBeGreaterThan(otherRate * 1.5);
  });

  it('挑每日目標不動用主亂數流：進入準備階段前後 rng 狀態相同', () => {
    const { game } = stockedStore(5);
    for (let day = 1; day <= 4; day++) {
      runOpenHours(game);
      const before = game.rng.state;
      game.startNextDay();
      expect(game.dailyGoal).not.toBeNull();
      expect(game.rng.state).toBe(before);
    }
  });
});

describe('進度', () => {
  it('營業中隨銷售更新，打烊時等於當天的成績', () => {
    const { game, close, next } = stockedStore(2);
    close();
    next();
    // 找一天銷量或結帳人數的目標
    while (!['sell-category', 'served'].includes(game.dailyGoal!.kind)) {
      close();
      next();
    }
    const goal = game.dailyGoal!;
    expect(goal.current).toBe(0);
    game.openStore();
    const seen: number[] = [];
    while (game.phase === 'open') {
      tickResolving(game, STEP_MS * MAX_STEPS_PER_TICK);
      if (game.phase === 'open') seen.push(game.dailyGoal!.current);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[Math.floor(seen.length / 2)]!).toBeGreaterThan(0);
    const report = game.lastReport!;
    const expected =
      goal.kind === 'served' ? report.customers.served : categorySold(report, goal.category as CategoryId);
    expect(report.dailyGoal!.current).toBe(expected);
    expect(report.dailyGoal!.met).toBe(expected >= goal.target);
  });

  it('目標數字隨店況調整：最低值以上，且不超過現有庫存', () => {
    const { game, close, next } = stockedStore(4);
    close();
    next();
    for (let day = 2; day <= 12; day++) {
      const g = game.dailyGoal!;
      if (g.kind === 'sell-category') expect(g.target).toBeGreaterThanOrEqual(10);
      if (g.kind === 'served') expect(g.target).toBeGreaterThanOrEqual(20);
      if (g.kind === 'no-stockout-empty' || g.kind === 'zero-waste') expect(g.target).toBe(0);
      close();
      next();
    }
  });
});

describe('打烊時判定', () => {
  /** 依結算檢查獎勵：達成時發放資金或口碑，沒達成時都不變 */
  function checkJudgement(report: DailyReport, goal: DailyGoalResult, incidentReputation: boolean) {
    const p = report.progress;
    const smoothed = Math.min(100, Math.max(0, nextReputation(p.reputationBefore, report.customers.avgSatisfaction)));
    const costs =
      report.purchases + report.rushShipping + report.fixtures + report.rent + report.wages + report.incidentCosts;
    expect(report.fundsAtEnd - report.fundsAtStart).toBe(report.revenue + report.goalFunds - costs);
    if (!goal.met) {
      expect(goal.granted).toBeNull();
      expect(report.goalFunds).toBe(0);
      if (!incidentReputation) expect(p.reputationAfter).toBeCloseTo(smoothed, 9);
      return 'failed';
    }
    expect(goal.granted).toEqual(goal.reward);
    if (goal.reward.type === 'funds') {
      expect(goal.reward.amount).toBeGreaterThanOrEqual(MIN_FUNDS_REWARD);
      expect(goal.reward.amount).toBeLessThanOrEqual(MAX_FUNDS_REWARD);
      expect(report.goalFunds).toBe(goal.reward.amount);
      if (!incidentReputation) expect(p.reputationAfter).toBeCloseTo(smoothed, 9);
      return 'funds';
    }
    expect(goal.reward.delta).toBe(REPUTATION_REWARD);
    expect(report.goalFunds).toBe(0);
    // 口碑獎勵併入當天的口碑變化
    expect(incidentReputation).toBe(false);
    expect(p.reputationAfter).toBeCloseTo(Math.min(100, smoothed + REPUTATION_REWARD), 9);
    return 'reputation';
  }

  it('達成時得到資金或口碑，沒達成不變；每日結算顯示結果', () => {
    const outcomes = new Set<string>();
    for (const seed of [1, 2, 3]) {
      // 進貨偏少，偶爾缺貨，才會出現「沒有顧客因缺貨空手離開」（口碑獎勵）
      const { close, next } = stockedStore(seed, { orderQty: 30 });
      close();
      next();
      for (let day = 2; day <= 20; day++) {
        const tracker = trackingReputation();
        const report = close(tracker.choose);
        expect(report.dailyGoal).not.toBeNull();
        if (tracker.touched && report.dailyGoal!.reward.type === 'reputation' && report.dailyGoal!.met) {
          next();
          continue;
        }
        outcomes.add(checkJudgement(report, report.dailyGoal!, tracker.touched));
        next();
      }
    }
    expect([...outcomes].sort()).toEqual(['failed', 'funds', 'reputation']);
  });

  it('沒有顧客的一天，每日目標沒達成：資金與口碑都不受影響', () => {
    const game = new Game({ seed: 3, customerArrivals: false });
    const fridge = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    if (!fridge.ok) throw new Error(fridge.error);
    game.assignSlot(fridge.value.id, 0, 'cola');
    game.submitPurchaseOrder([{ productId: 'cola', qty: 48 }]);
    playThroughDay(game);
    expect(game.dailyGoal).not.toBeNull();
    const funds = game.funds;
    const reputation = game.reputation;
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.dailyGoal!.met).toBe(false);
    expect(r.dailyGoal!.granted).toBeNull();
    expect(r.goalFunds).toBe(0);
    expect(game.funds).toBe(funds - r.rent - r.wages - r.purchases - r.incidentCosts);
    // 沒有顧客、口碑只可能被狀況的選項改變
    if (r.incidents.length === 0) expect(game.reputation).toBe(reputation);
  });
});
