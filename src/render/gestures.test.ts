import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, GestureTracker } from './gestures';
import type { GestureHandlers } from './gestures';

function setup() {
  const log: string[] = [];
  const pans: [number, number][] = [];
  const pinches: number[] = [];
  const handlers: GestureHandlers = {
    tap: (p) => log.push(`tap ${p.x},${p.y}`),
    secondary: () => log.push('secondary'),
    hover: (p) => log.push(p ? `hover ${p.x},${p.y}` : 'hover null'),
    pan: (dx, dy) => pans.push([dx, dy]),
    pinch: (_c, f) => pinches.push(f),
  };
  return { g: new GestureTracker(handlers), log, pans, pinches };
}

const touch = (id: number, x: number, y: number) => ({ id, x, y, button: 0, pointerType: 'touch' });
const mouse = (x: number, y: number, button = 0) => ({ id: 1, x, y, button, pointerType: 'mouse' });

describe('手勢判定', () => {
  it('手指沒有移動就放開：算點擊', () => {
    const { g, log } = setup();
    g.down(touch(1, 100, 100));
    g.up(touch(1, 100, 100));
    expect(log).toContain('tap 100,100');
  });

  it('移動不超過門檻：仍算點擊，不平移', () => {
    const { g, log, pans } = setup();
    g.down(touch(1, 100, 100));
    g.move(touch(1, 100 + DRAG_THRESHOLD - 1, 100));
    g.up(touch(1, 100 + DRAG_THRESHOLD - 1, 100));
    expect(log.some((l) => l.startsWith('tap'))).toBe(true);
    expect(pans).toEqual([]);
  });

  it('移動超過門檻：轉為拖曳平移，放開時不算點擊', () => {
    const { g, log, pans } = setup();
    g.down(touch(1, 100, 100));
    g.move(touch(1, 120, 100));
    g.move(touch(1, 130, 110));
    g.up(touch(1, 130, 110));
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
    expect(pans).toEqual([
      [20, 0],
      [10, 10],
    ]);
  });

  it('兩指張開：縮放倍率為距離比，放開後不算點擊', () => {
    const { g, log, pinches } = setup();
    g.down(touch(1, 100, 100));
    g.down(touch(2, 200, 100));
    g.move(touch(2, 300, 100));
    g.up(touch(2, 300, 100));
    g.up(touch(1, 100, 100));
    expect(pinches).toEqual([2]);
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });

  it('右鍵按下：觸發取消，不算點擊', () => {
    const { g, log } = setup();
    g.down(mouse(10, 10, 2));
    g.up(mouse(10, 10, 2));
    expect(log).toEqual(['secondary']);
  });

  it('滑鼠沒按鍵移動：更新 hover；觸控按下或拖曳不更新（預覽不會跟著平移的手指跑）', () => {
    const { g, log } = setup();
    g.move(mouse(5, 6));
    expect(log).toEqual(['hover 5,6']);
    g.down(touch(3, 7, 8));
    g.move(touch(3, 60, 80));
    expect(log).toEqual(['hover 5,6']);
  });

  it('觸控放開後的 pointerleave 不清掉 hover；滑鼠離開才清', () => {
    const { g, log } = setup();
    g.leave({ pointerType: 'touch' });
    expect(log).toEqual([]);
    g.leave({ pointerType: 'mouse' });
    expect(log).toEqual(['hover null']);
  });

  it('取消（pointercancel）：這次手勢不算點擊', () => {
    const { g, log } = setup();
    g.down(touch(1, 100, 100));
    g.cancel({ id: 1 });
    g.up(touch(1, 100, 100));
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
});
