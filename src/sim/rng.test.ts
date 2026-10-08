import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('相同種子產生相同序列', () => {
    expect(take(Rng.fromSeed(42), 10)).toEqual(take(Rng.fromSeed(42), 10));
  });

  it('不同種子產生不同序列', () => {
    expect(take(Rng.fromSeed(1), 10)).not.toEqual(take(Rng.fromSeed(2), 10));
  });

  it('從 state 還原後接續相同序列', () => {
    const a = Rng.fromSeed(7);
    take(a, 5);
    const b = Rng.fromState(a.state);
    expect(take(b, 10)).toEqual(take(a, 10));
  });

  it('next 落在 [0, 1)', () => {
    for (const v of take(Rng.fromSeed(3), 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int 含兩端且涵蓋整個範圍', () => {
    const rng = Rng.fromSeed(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('int 在 max < min 時拋錯', () => {
    expect(() => Rng.fromSeed(1).int(3, 1)).toThrow(RangeError);
  });

  it('pick 空陣列時拋錯', () => {
    expect(() => Rng.fromSeed(1).pick([])).toThrow(RangeError);
  });
});
