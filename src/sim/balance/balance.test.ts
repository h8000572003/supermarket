import { describe, expect, it } from 'vitest';
import { STARTING_FUNDS } from '../game';
import { minimal, overspend, simulate, standard } from './strategies';

/**
 * 平衡守門：調整數值後，這些經營結果的大方向不應改變。
 * 詳細數字用 `npm run balance` 查看。
 */
describe('平衡', () => {
  it.each([1, 2, 3])('標準經營撐過 30 天且資金成長（種子 %i）', (seed) => {
    const rows = simulate(standard, 30, seed);
    expect(rows).toHaveLength(30);
    expect(rows.at(-1)!.funds).toBeGreaterThan(STARTING_FUNDS);
    const reached = rows.flatMap((r) => r.milestones);
    expect(reached).toEqual(expect.arrayContaining(['first-revenue', 'good-reputation']));
  });

  it('標準經營的第一個里程碑在兩週內達成', () => {
    const rows = simulate(standard, 14, 1);
    expect(rows.some((r) => r.milestones.includes('first-revenue'))).toBe(true);
  });

  it('只開一個冷藏櫃賺不到錢', () => {
    const rows = simulate(minimal, 30, 1);
    expect(rows.at(-1)!.funds).toBeLessThan(STARTING_FUNDS / 2);
  });

  it('雇滿店員又高價販售，十天內破產', () => {
    const rows = simulate(overspend, 10, 1);
    expect(rows.at(-1)!.bankrupt).toBe(true);
  });
});
