import { describe, expect, it } from 'vitest';
import { STARTING_FUNDS } from '../game';
import {
  forecastAware,
  ignoreNuisances,
  minimal,
  neglectResponse,
  overspend,
  simulate,
  standard,
  worstResponse,
} from './strategies';

/**
 * 平衡守門：調整數值後，這些經營結果的大方向不應改變。
 * 詳細數字用 `npm run balance` 查看。
 */
// 每個案例都完整模擬 30 天（最差應對的案例跑兩種應對），單獨執行約 1–2.5 秒；
// 與其他測試平行時可能超過預設的 5 秒，所以放寬這組的時限
describe('平衡', { timeout: 30_000 }, () => {
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

  it.each([1, 2, 3])('狀況全選最差的選項，標準經營 30 天內不會破產（種子 %i）', (seed) => {
    // 一律花錢：狀況支出確實發生，但不足以拖垮標準經營的店
    const costly = simulate(worstResponse, 30, seed);
    expect(costly.reduce((s, r) => s + r.incidentCosts, 0)).toBeGreaterThan(0);
    // 一律不處理：口碑扣分、少一位店員
    const neglect = simulate(neglectResponse, 30, seed);
    for (const rows of [costly, neglect]) {
      expect(rows).toHaveLength(30);
      expect(rows.some((r) => r.bankrupt)).toBe(false);
      // 資金從未轉負，離破產還很遠
      expect(Math.min(...rows.map((r) => r.funds))).toBeGreaterThan(0);
    }
  });

  it.each([1, 2, 3])('依預報進貨 30 天後的資金高於標準經營（種子 %i）', (seed) => {
    // 預報值得看：同一家店，只差在依明日預報調整各類別的進貨量
    const informed = simulate(forecastAware, 30, seed);
    expect(informed).toHaveLength(30);
    expect(informed.at(-1)!.funds).toBeGreaterThan(simulate(standard, 30, seed).at(-1)!.funds);
  });

  it.each([1, 2, 3])('麻煩放著不管，30 天的累計營收明顯低於標準經營（種子 %i）', (seed) => {
    // 及時處理麻煩值得：同一家店，只差在不派店員處理垃圾、老鼠與奧客
    const revenue = (rows: { revenue: number }[]) => rows.reduce((s, r) => s + r.revenue, 0);
    const handled = simulate(standard, 30, seed);
    const ignored = simulate(ignoreNuisances, 30, seed);
    expect(ignored.reduce((s, r) => s + r.nuisances, 0)).toBeGreaterThan(0);
    expect(revenue(ignored)).toBeLessThan(revenue(handled) * 0.9);
  });
});
