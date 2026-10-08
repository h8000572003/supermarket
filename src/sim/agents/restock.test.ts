import { describe, expect, it } from 'vitest';
import { chooseRestockTask, slotKey } from './restock';
import type { RestockCandidate } from './restock';

const c = (slotIndex: number, qty: number, backroomQty = 10): RestockCandidate => ({
  fixtureId: 'f1',
  slotIndex,
  productId: 'cola',
  qty,
  capacity: 10,
  backroomQty,
});

describe('選擇補貨格位', () => {
  it('低於 30% 才需要補貨', () => {
    expect(chooseRestockTask([c(0, 3)], new Set())).toBeNull();
    expect(chooseRestockTask([c(0, 2)], new Set())).toEqual(c(0, 2));
  });

  it('倉庫沒貨時不補', () => {
    expect(chooseRestockTask([c(0, 0, 0)], new Set())).toBeNull();
  });

  it('陳列比例最低的優先', () => {
    expect(chooseRestockTask([c(0, 2), c(1, 0), c(2, 1)], new Set())?.slotIndex).toBe(1);
  });

  it('跳過已被其他店員認領的格位', () => {
    expect(chooseRestockTask([c(0, 0), c(1, 1)], new Set([slotKey('f1', 0)]))?.slotIndex).toBe(1);
  });
});
