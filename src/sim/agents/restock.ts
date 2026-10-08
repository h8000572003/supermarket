/** 一個可能需要補貨的格位 */
export interface RestockCandidate {
  readonly fixtureId: string;
  readonly slotIndex: number;
  readonly productId: string;
  readonly qty: number;
  readonly capacity: number;
  readonly backroomQty: number;
}

/** 陳列庫存低於容量的這個比例時需要補貨 */
export const RESTOCK_THRESHOLD = 0.3;

export const slotKey = (fixtureId: string, slotIndex: number) => `${fixtureId}#${slotIndex}`;

export function needsRestock(c: RestockCandidate): boolean {
  return c.qty < c.capacity * RESTOCK_THRESHOLD && c.backroomQty > 0;
}

/** 選出最該補貨的格位：未被其他店員認領、低於門檻且倉庫有貨，陳列比例最低者優先 */
export function chooseRestockTask(
  candidates: readonly RestockCandidate[],
  reserved: ReadonlySet<string>,
): RestockCandidate | null {
  let best: RestockCandidate | null = null;
  for (const c of candidates) {
    if (!needsRestock(c) || reserved.has(slotKey(c.fixtureId, c.slotIndex))) continue;
    if (!best || c.qty / c.capacity < best.qty / best.capacity) best = c;
  }
  return best;
}
