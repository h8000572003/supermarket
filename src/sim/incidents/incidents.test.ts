import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { INCIDENTS, INCIDENT_WINDOW, incidentDefinition, optionGoods, scheduleIncidents } from './incidents';
import type { IncidentContext, IncidentDefinition, IncidentKind } from './incidents';

const ctx: IncidentContext = {
  day: 2,
  funds: 10_000,
  workingStaff: 2,
  registers: 1,
  displayedProducts: ['cola', 'water', 'chips'],
};

/** 測試用的假狀況（種類 id 借用字串） */
function fake(kind: string, precondition: (c: IncidentContext) => boolean = () => true): IncidentDefinition {
  const free = { label: '不處理', detail: '', cost: 0, effects: [] };
  return {
    kind: kind as IncidentKind,
    name: kind,
    description: () => '',
    precondition,
    options: () => [free, free],
  };
}

describe('狀況定義', () => {
  it('每種狀況恰好 2 個選項，且至少一個不花錢（資金為負也能處理）', () => {
    for (const def of INCIDENTS) {
      for (let seed = 1; seed <= 5; seed++) {
        const params = def.rollParams?.(Rng.fromSeed(seed), ctx) ?? {};
        const options = def.options(params);
        expect(options).toHaveLength(2);
        expect(options.some((o) => o.cost === 0)).toBe(true);
        expect(def.description(params)).not.toBe('');
        // 費用至少涵蓋進貨的部分
        for (const o of options) expect(o.cost).toBeGreaterThanOrEqual(optionGoods(o));
      }
    }
  });

  it('種類 id 不重複', () => {
    expect(new Set(INCIDENTS.map((d) => d.kind)).size).toBe(INCIDENTS.length);
  });
});

describe('狀況的前提與參數', () => {
  it('團客來店需要店內有收銀台', () => {
    const def = incidentDefinition('group-visit');
    expect(def.precondition(ctx)).toBe(true);
    expect(def.precondition({ ...ctx, registers: 0 })).toBe(false);
  });

  it('熱浪需要店裡有陳列飲料；免運費叫貨為每種陳列飲料各訂最低訂購量', () => {
    const def = incidentDefinition('heat-wave');
    expect(def.precondition({ ...ctx, displayedProducts: ['chips'] })).toBe(false);
    const params = def.rollParams!(Rng.fromSeed(1), ctx);
    expect(params.lines).toEqual([
      { productId: 'cola', qty: 12 },
      { productId: 'water', qty: 12 },
    ]);
    // 商品金額：可樂 12 × $15 + 礦泉水 12 × $7
    expect(def.options(params)[0].cost).toBe(12 * 15 + 12 * 7);
  });

  it('供應商出清只挑店裡有陳列的商品；一批為最低訂購量 × 2、總價為進價 7 折', () => {
    const def = incidentDefinition('supplier-clearance');
    expect(def.precondition({ ...ctx, displayedProducts: [] })).toBe(false);
    const picked = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) picked.add(def.rollParams!(Rng.fromSeed(seed), ctx).productId!);
    expect([...picked].sort()).toEqual(['chips', 'cola', 'water']);
    const [buy] = def.options({ productId: 'cola' });
    // 可樂：最低訂購量 12 × 2 = 24 個，24 × $15 × 0.7 = $252
    expect(buy.cost).toBe(252);
    expect(buy.effects).toContainEqual({ type: 'instant-delivery', lines: [{ productId: 'cola', qty: 24 }], goods: 252 });
  });
});

describe('狀況排程', () => {
  it('第 1 天沒有狀況，也不消耗亂數', () => {
    const rng = Rng.fromSeed(1);
    expect(scheduleIncidents(rng, 1, [], ctx)).toEqual([]);
    expect(rng.state).toBe(Rng.fromSeed(1).state);
  });

  it('種類夠多時一天 1–2 個、同一天不重複、時刻在範圍內且依時刻排序', () => {
    const defs = ['a', 'b', 'c', 'd'].map((k) => fake(k));
    const counts = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const s = scheduleIncidents(Rng.fromSeed(seed), 2, [], ctx, defs);
      counts.add(s.length);
      expect(new Set(s.map((x) => x.kind)).size).toBe(s.length);
      for (const x of s) {
        expect(x.minute).toBeGreaterThanOrEqual(INCIDENT_WINDOW[0]);
        expect(x.minute).toBeLessThanOrEqual(INCIDENT_WINDOW[1]);
      }
      expect(s.map((x) => x.minute)).toEqual([...s.map((x) => x.minute)].sort((a, b) => a - b));
    }
    expect([...counts].sort()).toEqual([1, 2]);
  });

  it('不抽前一天發生過的種類與前提不成立的種類', () => {
    const defs = [fake('a'), fake('b'), fake('c', () => false), fake('d')];
    for (let seed = 1; seed <= 50; seed++) {
      const kinds = scheduleIncidents(Rng.fromSeed(seed), 3, ['a' as IncidentKind], ctx, defs).map((x) => x.kind);
      expect(kinds).not.toContain('a');
      expect(kinds).not.toContain('c');
    }
  });

  it('一天最多「種類總數 − 1」個，隔天一定還有種類可抽', () => {
    const defs = [fake('a'), fake('b')];
    for (let seed = 1; seed <= 30; seed++) {
      expect(scheduleIncidents(Rng.fromSeed(seed), 2, [], ctx, defs)).toHaveLength(1);
    }
  });

  it('沒有符合的種類時當天沒有狀況', () => {
    const defs = [fake('a'), fake('b', () => false)];
    expect(scheduleIncidents(Rng.fromSeed(1), 4, ['a' as IncidentKind], ctx, defs)).toEqual([]);
  });
});
