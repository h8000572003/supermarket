import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { INCIDENTS, INCIDENT_WINDOW, scheduleIncidents } from './incidents';
import type { IncidentContext, IncidentDefinition, IncidentKind } from './incidents';

const ctx: IncidentContext = { day: 2, funds: 10_000, workingStaff: 2, registers: 1 };

/** 測試用的假狀況（種類 id 借用字串） */
function fake(kind: string, precondition: (c: IncidentContext) => boolean = () => true): IncidentDefinition {
  const free = { label: '不處理', detail: '', cost: 0, effects: [] };
  return { kind: kind as IncidentKind, name: kind, description: '', precondition, options: [free, free] };
}

describe('狀況定義', () => {
  it('每種狀況恰好 2 個選項，且至少一個不花錢（資金為負也能處理）', () => {
    for (const def of INCIDENTS) {
      expect(def.options).toHaveLength(2);
      expect(def.options.some((o) => o.cost === 0)).toBe(true);
    }
  });

  it('種類 id 不重複', () => {
    expect(new Set(INCIDENTS.map((d) => d.kind)).size).toBe(INCIDENTS.length);
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
