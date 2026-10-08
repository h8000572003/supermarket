/** 同一張進貨單送達的同一商品 */
export interface Batch {
  readonly productId: string;
  readonly qty: number;
  /** 送達的營業日 */
  readonly arrivedDay: number;
}

export function totalQty(batches: readonly Batch[]): number {
  return batches.reduce((sum, b) => sum + b.qty, 0);
}

/** 加入批次並維持先進先出順序；同日送達的批次合併 */
export function addBatch(batches: readonly Batch[], batch: Batch): Batch[] {
  if (batch.qty <= 0) return [...batches];
  const result: Batch[] = [];
  let inserted = false;
  for (const b of batches) {
    if (!inserted && b.arrivedDay === batch.arrivedDay) {
      result.push({ ...b, qty: b.qty + batch.qty });
      inserted = true;
    } else {
      if (!inserted && b.arrivedDay > batch.arrivedDay) {
        result.push(batch);
        inserted = true;
      }
      result.push(b);
    }
  }
  if (!inserted) result.push(batch);
  return result;
}

/** 依先進先出取出最多 qty 個；回傳取出的批次與剩下的批次 */
export function takeFifo(batches: readonly Batch[], qty: number): { taken: Batch[]; rest: Batch[] } {
  const taken: Batch[] = [];
  const rest: Batch[] = [];
  let remaining = qty;
  for (const b of batches) {
    if (remaining <= 0) {
      rest.push(b);
    } else if (b.qty <= remaining) {
      taken.push(b);
      remaining -= b.qty;
    } else {
      taken.push({ ...b, qty: remaining });
      rest.push({ ...b, qty: b.qty - remaining });
      remaining = 0;
    }
  }
  return { taken, rest };
}
