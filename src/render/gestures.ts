import type { ScreenPoint } from './iso';

/** 手指移動超過這個距離（px）就算拖曳，放開時不算點擊 */
export const DRAG_THRESHOLD = 8;

export interface PointerSample {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** 0 左鍵 / 觸控，2 右鍵 */
  readonly button: number;
  readonly pointerType: string;
}

export interface GestureHandlers {
  tap(p: ScreenPoint, pointerType: string): void;
  /** 右鍵按下 */
  secondary(): void;
  hover(p: ScreenPoint | null): void;
  pan(dx: number, dy: number): void;
  pinch(center: ScreenPoint, factor: number): void;
}

const dist = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 把原始指標事件轉成點擊、拖曳平移、雙指縮放。
 * 一次手勢（第一指按下到最後一指放開）只要拖曳或用過兩指，就不再算點擊。
 */
export class GestureTracker {
  private readonly pointers = new Map<number, ScreenPoint>();
  private start: ScreenPoint | null = null;
  private startType = 'mouse';
  private consumed = false;

  constructor(private readonly on: GestureHandlers) {}

  down(e: PointerSample): void {
    if (e.button === 2) return this.on.secondary();
    if (e.button !== 0) return;
    this.pointers.set(e.id, { x: e.x, y: e.y });
    if (this.pointers.size === 1) {
      this.start = { x: e.x, y: e.y };
      this.startType = e.pointerType;
      this.consumed = false;
      // 觸控沒有 hover：按下時就讓預覽跟到手指的位置
      if (e.pointerType !== 'mouse') this.on.hover({ x: e.x, y: e.y });
    } else {
      this.consumed = true;
    }
  }

  move(e: PointerSample): void {
    const prev = this.pointers.get(e.id);
    if (!prev) {
      if (e.pointerType === 'mouse' && this.pointers.size === 0) this.on.hover({ x: e.x, y: e.y });
      return;
    }
    const next = { x: e.x, y: e.y };
    if (this.pointers.size >= 2) {
      const other = [...this.pointers].find(([id]) => id !== e.id)?.[1];
      if (other) {
        const before = dist(prev, other);
        const after = dist(next, other);
        const c0 = mid(prev, other);
        const c1 = mid(next, other);
        this.on.pan(c1.x - c0.x, c1.y - c0.y);
        if (before > 0 && after > 0) this.on.pinch(c1, after / before);
      }
      this.pointers.set(e.id, next);
      return;
    }
    if (!this.consumed && this.start && dist(this.start, next) > DRAG_THRESHOLD) {
      this.consumed = true;
      // 從起點開始算位移，拖曳不會因門檻而跳一下
      this.on.pan(next.x - this.start.x, next.y - this.start.y);
    } else if (this.consumed) {
      this.on.pan(next.x - prev.x, next.y - prev.y);
    } else if (e.pointerType === 'mouse') {
      this.on.hover(next);
    }
    this.pointers.set(e.id, next);
  }

  up(e: PointerSample): void {
    if (!this.pointers.has(e.id)) return;
    this.pointers.delete(e.id);
    if (this.pointers.size > 0) return;
    if (!this.consumed) this.on.tap({ x: e.x, y: e.y }, this.startType);
    this.start = null;
  }

  cancel(e: Pick<PointerSample, 'id'>): void {
    this.pointers.delete(e.id);
    this.consumed = true;
    if (this.pointers.size === 0) this.start = null;
  }

  leave(): void {
    if (this.pointers.size === 0) this.on.hover(null);
  }
}
