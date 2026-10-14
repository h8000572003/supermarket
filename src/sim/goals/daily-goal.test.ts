import { describe, expect, it } from 'vitest';
import type { CategoryId } from '../catalog/products';
import { Rng } from '../rng';
import { dayConditions } from '../weather/weather';
import type { Weather } from '../weather/weather';
import {
  MAX_FUNDS_REWARD,
  MIN_FUNDS_REWARD,
  MIN_SELL_TARGET,
  MIN_SERVED_TARGET,
  describeDailyGoal,
  goalCandidates,
  goalStatus,
  isGoalMet,
  pickDailyGoal,
  sellTarget,
  servedTarget,
} from './daily-goal';
import type { GoalContext, GoalDayStats, GoalMeasures } from './daily-goal';

const day = (served: number, sales: Partial<Record<CategoryId, number>>, stockoutEmpty = 0): GoalDayStats => ({
  served,
  sales,
  stockoutEmpty,
});

/** 第 3 天（週三）晴，飲料、零食、泡麵都有陳列 */
function ctx(overrides: Partial<GoalContext> & { weather?: Weather; dayNumber?: number } = {}): GoalContext {
  const { weather = 'sunny', dayNumber = 3, ...rest } = overrides;
  return {
    conditions: dayConditions(dayNumber, weather),
    categories: ['drink', 'snack', 'noodle'],
    history: [day(100, { drink: 60, snack: 40, noodle: 30 }), day(100, { drink: 60, snack: 40, noodle: 30 })],
    expiringFresh: 0,
    ...rest,
  };
}

const kindsOf = (c: GoalContext) =>
  goalCandidates(c).map((x) => (x.goal.kind === 'sell-category' ? `sell:${x.goal.category}` : x.goal.kind));

describe('目標數字', () => {
  it('銷量目標：最近平均 × 1.15，進位到 5；晴天平日不加權', () => {
    // 60 × 1.15 = 69 → 70
    expect(sellTarget(ctx(), 'drink')).toBe(70);
    // 平均 (20 + 40) / 2 = 30 → 34.5 → 35
    expect(sellTarget(ctx({ history: [day(50, { snack: 20 }), day(50, { snack: 40 })] }), 'snack')).toBe(35);
  });

  it('熱天的飲料目標較高、冷天較低；雨天整體較低、週末較高', () => {
    const sunny = sellTarget(ctx(), 'drink')!;
    expect(sellTarget(ctx({ weather: 'hot' }), 'drink')!).toBeGreaterThan(sunny);
    expect(sellTarget(ctx({ weather: 'cold' }), 'drink')!).toBeLessThan(sunny);
    expect(sellTarget(ctx({ weather: 'cold' }), 'noodle')!).toBeGreaterThan(sellTarget(ctx(), 'noodle')!);
    expect(servedTarget(ctx({ weather: 'rainy' }))).toBeLessThan(servedTarget(ctx()));
    expect(servedTarget(ctx({ dayNumber: 6 }))).toBeGreaterThan(servedTarget(ctx()));
  });

  it('沒有紀錄或銷量很低時用最低值', () => {
    expect(sellTarget(ctx({ history: [] }), 'drink')).toBe(MIN_SELL_TARGET);
    expect(sellTarget(ctx({ history: [day(3, { drink: 2 })] }), 'drink')).toBe(MIN_SELL_TARGET);
    expect(servedTarget(ctx({ history: [] }))).toBe(MIN_SERVED_TARGET);
  });

  it('結帳人數目標：最近平均 × 1.15，進位到 5', () => {
    // 100 × 1.15 = 115
    expect(servedTarget(ctx())).toBe(115);
    expect(servedTarget(ctx({ history: [day(60, {}), day(80, {})] }))).toBe(85);
  });
});

describe('目標池', () => {
  it('銷量目標只涉及有陳列的類別；結帳人數目標一定在池中', () => {
    expect(kindsOf(ctx({ categories: ['drink'] }))).toEqual(['sell:drink', 'served']);
    expect(kindsOf(ctx({ categories: [] }))).toEqual(['served']);
  });

  it('最近有人因缺貨空手離開、且平均不多時，才出「沒有顧客因缺貨空手離開」', () => {
    const none = [day(100, {}, 0), day(100, {}, 0)];
    const some = [day(100, {}, 0), day(100, {}, 3)];
    const many = [day(100, {}, 9), day(100, {}, 12)];
    expect(kindsOf(ctx({ history: none }))).not.toContain('no-stockout-empty');
    expect(kindsOf(ctx({ history: some }))).toContain('no-stockout-empty');
    expect(kindsOf(ctx({ history: many }))).not.toContain('no-stockout-empty');
  });

  it('有鮮食陳列、今天有鮮食到期且賣得完時，才出零報廢目標', () => {
    const history = [day(100, { fresh: 30 }), day(100, { fresh: 30 })];
    const withFresh: CategoryId[] = ['drink', 'fresh'];
    expect(kindsOf(ctx({ categories: withFresh, history, expiringFresh: 12 }))).toContain('zero-waste');
    // 沒有到期的鮮食：太簡單
    expect(kindsOf(ctx({ categories: withFresh, history, expiringFresh: 0 }))).not.toContain('zero-waste');
    // 到期的比平常賣得還多：做不到
    expect(kindsOf(ctx({ categories: withFresh, history, expiringFresh: 40 }))).not.toContain('zero-waste');
    // 鮮食沒有陳列
    expect(kindsOf(ctx({ categories: ['drink'], history, expiringFresh: 12 }))).not.toContain('zero-waste');
  });

  it('獎勵為資金 $500–1,500 或口碑 +2', () => {
    const history = [day(400, { drink: 300, fresh: 30 }, 1), day(400, { drink: 300, fresh: 30 }, 1)];
    const c = ctx({
      categories: ['drink', 'fresh', 'snack'],
      history,
      expiringFresh: 5,
    });
    for (const { goal } of goalCandidates(c)) {
      if (goal.reward.type === 'funds') {
        expect(goal.reward.amount).toBeGreaterThanOrEqual(MIN_FUNDS_REWARD);
        expect(goal.reward.amount).toBeLessThanOrEqual(MAX_FUNDS_REWARD);
      } else {
        expect(goal.reward.delta).toBe(2);
      }
    }
  });
});

describe('挑選', () => {
  /** 以同一亂數流挑 n 次，回傳各目標出現的比例 */
  function share(c: GoalContext, key: string, n = 2000): number {
    const rng = Rng.fromSeed(7);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const g = pickDailyGoal(rng, c);
      if ((g.kind === 'sell-category' ? `sell:${g.category}` : g.kind) === key) hits++;
    }
    return hits / n;
  }

  it('熱天飲料目標較常出現，冷天泡麵目標較常出現', () => {
    expect(share(ctx({ weather: 'hot' }), 'sell:drink')).toBeGreaterThan(share(ctx(), 'sell:drink') * 1.8);
    expect(share(ctx({ weather: 'cold' }), 'sell:noodle')).toBeGreaterThan(share(ctx(), 'sell:noodle') * 1.8);
    expect(share(ctx({ weather: 'hot' }), 'sell:noodle')).toBeLessThan(share(ctx(), 'sell:noodle'));
  });

  it('週末結帳人數目標較常出現', () => {
    expect(share(ctx({ dayNumber: 6 }), 'served')).toBeGreaterThan(share(ctx({ dayNumber: 3 }), 'served'));
  });

  it('同一亂數狀態挑出相同目標，每次只用一個亂數', () => {
    const a = Rng.fromSeed(3);
    const b = Rng.fromSeed(3);
    expect(pickDailyGoal(a, ctx())).toEqual(pickDailyGoal(b, ctx()));
    const c = Rng.fromSeed(3);
    c.next();
    expect(a.state).toBe(c.state);
  });
});

describe('進度與判定', () => {
  const measures = (m: Partial<GoalMeasures>): GoalMeasures => ({
    categorySales: () => 0,
    served: 0,
    stockoutEmpty: 0,
    expiringFresh: 0,
    ...m,
  });

  it('銷量與結帳人數：達到目標才算達成', () => {
    const sell = {
      kind: 'sell-category',
      category: 'drink',
      target: 40,
      reward: { type: 'funds', amount: 800 },
    } as const;
    expect(goalStatus(sell, measures({ categorySales: (c) => (c === 'drink' ? 39 : 99) }))).toMatchObject({
      current: 39,
      met: false,
      description: '賣出 40 件飲料',
    });
    expect(goalStatus(sell, measures({ categorySales: () => 40 })).met).toBe(true);
    const served = { kind: 'served', target: 120, reward: { type: 'funds', amount: 1000 } } as const;
    expect(goalStatus(served, measures({ served: 121 }))).toMatchObject({ current: 121, met: true });
  });

  it('缺貨空手與零報廢：數字為 0 才算達成', () => {
    const noStockout = { kind: 'no-stockout-empty', target: 0, reward: { type: 'reputation', delta: 2 } } as const;
    expect(isGoalMet(noStockout, 0)).toBe(true);
    expect(isGoalMet(noStockout, 1)).toBe(false);
    const zeroWaste = { kind: 'zero-waste', target: 0, reward: { type: 'funds', amount: 600 } } as const;
    expect(goalStatus(zeroWaste, measures({ expiringFresh: 3 }))).toMatchObject({ current: 3, met: false });
    expect(describeDailyGoal(noStockout)).toBe('沒有顧客因缺貨空手離開');
  });
});
