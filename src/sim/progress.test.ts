import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { BANKRUPTCY_DAYS, STARTING_REPUTATION } from './progress/progress';
import { playThroughDay, runOpenHours } from './test-helpers';

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/** 有貨、2 位店員、1 台收銀台的店；每天開店前把格位補滿 */
function goodStore(seed = 1) {
  const game = new Game({ seed });
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
  /** 下單補足一天的量後跑完一天 */
  const day = () => {
    game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 36 })));
    playThroughDay(game);
    for (const f of displays) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
  };
  day(); // 第 1 天沒貨，只為了讓進貨送達
  return { game, day };
}

describe('口碑與來客', () => {
  it('滿意的一天讓口碑上升', () => {
    const { game } = goodStore();
    runOpenHours(game);
    const p = game.lastReport!.progress;
    expect(p.reputationBefore).toBeLessThan(p.reputationAfter);
    expect(game.reputation).toBe(p.reputationAfter);
  });

  it('架上全空的一天讓口碑下降', () => {
    const game = new Game({ seed: 1 });
    runOpenHours(game);
    expect(game.reputation).toBeLessThan(STARTING_REPUTATION);
  });

  it('口碑越高，來客越多', () => {
    const entered = (startingReputation: number) => {
      const game = new Game({ seed: 3, startingReputation });
      runOpenHours(game);
      return game.lastReport!.customers.entered;
    };
    expect(entered(90)).toBeGreaterThan(entered(10) * 1.8);
  });

  it('有賣但架上沒貨才算缺貨，依類別記錄', () => {
    const game = new Game({ seed: 1 });
    const r0 = game.placeFixture('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
    if (!r0.ok) throw new Error(r0.error);
    game.assignSlot(r0.value.id, 0, 'cola');
    runOpenHours(game);
    const r = game.lastReport!;
    expect(r.stockouts.drink).toBeGreaterThan(0);
    // 零食、泡麵店裡沒賣：不算缺貨
    expect(r.stockouts.snack).toBeUndefined();
    expect(r.stockouts.noodle).toBeUndefined();
  });
});

describe('里程碑', () => {
  it('累積營收達標解鎖鮮食、口碑達標解鎖日用品', () => {
    const { game, day } = goodStore(5);
    expect(game.isUnlocked('fresh')).toBe(false);
    const reached: string[] = [];
    for (let i = 0; i < 8; i++) {
      day();
      reached.push(...game.lastReport!.progress.milestonesReached);
    }
    expect(reached).toContain('first-revenue');
    expect(reached).toContain('good-reputation');
    expect(game.isUnlocked('fresh')).toBe(true);
    expect(game.isUnlocked('daily')).toBe(true);
    expect(new Set(reached).size).toBe(reached.length);
  });
});

describe('破產', () => {
  /** 把錢花光、雇滿店員卻沒有營收 */
  function brokeStore() {
    const game = new Game({ seed: 1 });
    for (let i = 0; i < 6; i++) game.hireStaff();
    for (const y of [0, 3]) {
      for (let x = 0; x + 1 < 12 && game.funds >= 4_000; x += 2) {
        game.placeFixture('fridge', { origin: { x, y }, facing: 'south' });
      }
    }
    return game;
  }

  it(`資金連續 ${BANKRUPTCY_DAYS} 天為負就破產，之後無法進入下一天`, () => {
    const game = brokeStore();
    for (let d = 1; d < BANKRUPTCY_DAYS; d++) {
      playThroughDay(game);
      expect(game.lastReport!.progress.negativeDays).toBe(d);
    }
    runOpenHours(game);
    expect(game.phase).toBe('gameover');
    expect(game.lastReport!.progress.bankrupt).toBe(true);
    expect(game.startNextDay()).toEqual({ ok: false, error: 'not-report-phase' });
  });

  it('資金回正時重新計算', () => {
    const game = brokeStore();
    playThroughDay(game);
    expect(game.lastReport!.progress.negativeDays).toBe(1);
    const shelf = game.fixtures[0]!;
    // 賣掉設施讓資金回正
    for (const f of game.fixtures) if (f.id !== shelf.id) game.sellFixture(f.id);
    for (const s of [...game.staff]) game.fireStaff(s.id);
    playThroughDay(game);
    expect(game.lastReport!.progress.negativeDays).toBe(0);
  });
});
