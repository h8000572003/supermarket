import { describe, expect, it } from 'vitest';
import { MILESTONES, arrivalMultiplier, nextReputation } from './progress';

describe('口碑', () => {
  it('以當天平均滿意度平滑更新', () => {
    expect(nextReputation(50, 100)).toBe(65);
    expect(nextReputation(50, 0)).toBe(35);
  });

  it('當天沒有顧客時不變', () => {
    expect(nextReputation(42, null)).toBe(42);
  });

  it('來客倍率：口碑 0 → 0.5、50 → 1、100 → 1.5', () => {
    expect([arrivalMultiplier(0), arrivalMultiplier(50), arrivalMultiplier(100)]).toEqual([0.5, 1, 1.5]);
  });
});

describe('里程碑', () => {
  it('鮮食與日用品各由一個里程碑解鎖', () => {
    expect(MILESTONES.map((m) => m.unlocks).filter(Boolean).sort()).toEqual(['daily', 'fresh']);
  });

  it('進度依累計成績計算，上限為 1', () => {
    const ctx = { totalRevenue: 10_000, reputation: 80, bestServed: 30 };
    const progress = Object.fromEntries(MILESTONES.map((m) => [m.id, m.progress(ctx)]));
    expect(progress).toEqual({ 'first-revenue': 0.5, 'good-reputation': 1, 'busy-day': 0.2 });
  });
});
