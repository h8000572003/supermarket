import { describe, expect, it } from 'vitest';
import { addBatch, takeFifo, totalQty } from './batch';

const b = (qty: number, arrivedDay: number) => ({ productId: 'p', qty, arrivedDay });

describe('批次', () => {
  it('依送達日排序，同日合併', () => {
    let batches = addBatch([], b(5, 3));
    batches = addBatch(batches, b(4, 1));
    batches = addBatch(batches, b(2, 3));
    expect(batches).toEqual([b(4, 1), b(7, 3)]);
  });

  it('先進先出：先取舊批次，必要時拆開批次', () => {
    const { taken, rest } = takeFifo([b(4, 1), b(10, 2)], 6);
    expect(taken).toEqual([b(4, 1), b(2, 2)]);
    expect(rest).toEqual([b(8, 2)]);
  });

  it('不足時取出全部', () => {
    const { taken, rest } = takeFifo([b(3, 1)], 10);
    expect(totalQty(taken)).toBe(3);
    expect(rest).toEqual([]);
  });

  it('忽略數量為 0 的批次', () => {
    expect(addBatch([b(1, 1)], b(0, 2))).toEqual([b(1, 1)]);
  });
});
