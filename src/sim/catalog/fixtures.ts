export type FixtureKind = 'shelf' | 'fridge' | 'register';

export interface FixtureDef {
  readonly kind: FixtureKind;
  readonly name: string;
  /** 購買價格 */
  readonly price: number;
  /** 沿正面方向的格數 */
  readonly width: number;
  /** 垂直於正面方向的格數 */
  readonly depth: number;
  /** 背面是否需要店員側取用格 */
  readonly staffSide: boolean;
  /** 格位數（陳列櫃才有） */
  readonly slots: number;
  /** 每個格位的容量 */
  readonly slotCapacity: number;
}

export const FIXTURES: Readonly<Record<FixtureKind, FixtureDef>> = {
  shelf: { kind: 'shelf', name: '一般貨架', price: 2_000, width: 2, depth: 1, staffSide: false, slots: 4, slotCapacity: 12 },
  fridge: { kind: 'fridge', name: '冷藏櫃', price: 4_000, width: 2, depth: 1, staffSide: false, slots: 4, slotCapacity: 10 },
  register: { kind: 'register', name: '收銀台', price: 3_000, width: 1, depth: 1, staffSide: true, slots: 0, slotCapacity: 0 },
};

export const FIXTURE_KINDS = Object.keys(FIXTURES) as FixtureKind[];

/** 出售設施時回收的比例 */
export const SELL_REFUND_RATE = 0.5;
