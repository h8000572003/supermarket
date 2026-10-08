import { addBatch, takeFifo, totalQty } from './batch';
import type { Batch } from './batch';

export interface Slot {
  /** 指定的商品；null 表示未指定 */
  readonly productId: string | null;
  readonly batches: readonly Batch[];
}

const EMPTY_SLOT: Slot = { productId: null, batches: [] };

/**
 * 倉庫與各陳列櫃格位的庫存，皆以批次保存。
 * 只負責庫存搬移；能不能這樣做（類別、階段等規則）由 Game 判斷。
 */
export class Inventory {
  private readonly backroom = new Map<string, Batch[]>();
  private readonly displays = new Map<string, Slot[]>();

  backroomBatches(productId: string): readonly Batch[] {
    return this.backroom.get(productId) ?? [];
  }

  backroomQty(productId: string): number {
    return totalQty(this.backroomBatches(productId));
  }

  /** 商品送達或退回倉庫 */
  receive(batches: readonly Batch[]): void {
    for (const batch of batches) {
      this.backroom.set(batch.productId, addBatch(this.backroomBatches(batch.productId), batch));
    }
  }

  addDisplay(fixtureId: string, slotCount: number): void {
    this.displays.set(fixtureId, Array.from({ length: slotCount }, () => EMPTY_SLOT));
  }

  /** 移除陳列櫃，格位上的商品退回倉庫 */
  removeDisplay(fixtureId: string): void {
    for (const slot of this.displays.get(fixtureId) ?? []) this.receive(slot.batches);
    this.displays.delete(fixtureId);
  }

  slots(fixtureId: string): readonly Slot[] {
    return this.displays.get(fixtureId) ?? [];
  }

  slot(fixtureId: string, index: number): Slot | undefined {
    return this.displays.get(fixtureId)?.[index];
  }

  /** 指定格位的商品；原本的陳列庫存退回倉庫 */
  assignSlot(fixtureId: string, index: number, productId: string | null): void {
    const current = this.slot(fixtureId, index);
    if (!current || current.productId === productId) return;
    this.receive(current.batches);
    this.setSlot(fixtureId, index, { productId, batches: [] });
  }

  /** 從倉庫以先進先出補到 capacity；回傳補上的數量 */
  restockSlot(fixtureId: string, index: number, capacity: number): number {
    const current = this.slot(fixtureId, index);
    if (!current?.productId) return 0;
    const room = capacity - totalQty(current.batches);
    if (room <= 0) return 0;
    const { taken, rest } = takeFifo(this.backroomBatches(current.productId), room);
    this.backroom.set(current.productId, rest);
    this.setSlot(fixtureId, index, { ...current, batches: taken.reduce(addBatch, current.batches) });
    return totalQty(taken);
  }

  /** 顧客從格位以先進先出拿取商品 */
  takeFromSlot(fixtureId: string, index: number, qty: number): Batch[] {
    const current = this.slot(fixtureId, index);
    if (!current) return [];
    const { taken, rest } = takeFifo(current.batches, qty);
    this.setSlot(fixtureId, index, { ...current, batches: rest });
    return taken;
  }

  /** 移除倉庫與所有格位中符合條件的批次；回傳被移除的批次 */
  removeBatches(shouldRemove: (batch: Batch) => boolean): Batch[] {
    const removed: Batch[] = [];
    const keep = (batches: readonly Batch[]) =>
      batches.filter((b) => {
        if (!shouldRemove(b)) return true;
        removed.push(b);
        return false;
      });
    for (const [productId, batches] of this.backroom) this.backroom.set(productId, keep(batches));
    for (const [fixtureId, slots] of this.displays) {
      this.displays.set(
        fixtureId,
        slots.map((s) => ({ ...s, batches: keep(s.batches) })),
      );
    }
    return removed;
  }

  private setSlot(fixtureId: string, index: number, slot: Slot): void {
    const slots = this.displays.get(fixtureId);
    if (!slots) return;
    this.displays.set(fixtureId, slots.map((s, i) => (i === index ? slot : s)));
  }
}
