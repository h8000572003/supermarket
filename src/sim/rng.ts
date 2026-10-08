/**
 * 可設種子的亂數產生器（mulberry32）。
 * 相同種子產生相同序列；`state` 可存檔後以 `Rng.fromState` 還原。
 */
export class Rng {
  private constructor(private s: number) {}

  static fromSeed(seed: number): Rng {
    return new Rng(seed >>> 0);
  }

  static fromState(state: number): Rng {
    return new Rng(state >>> 0);
  }

  get state(): number {
    return this.s;
  }

  /** [0, 1) 之間的浮點數 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 之間的整數（含兩端） */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`max (${max}) < min (${min})`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 以機率 p 回傳 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from empty array');
    return items[this.int(0, items.length - 1)] as T;
  }
}
