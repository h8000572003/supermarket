import { describe, expect, it } from 'vitest';
import { Camera, MAX_USER_ZOOM, MIN_USER_ZOOM, fitZoom } from './camera';
import type { StoreBounds, Viewport } from './camera';

const store: StoreBounds = { width: 700, height: 400, center: { x: 0, y: 200 } };
const none = { top: 0, right: 0, bottom: 0, left: 0 };
const phone: Viewport = { width: 390, height: 844, reserve: { top: 60, right: 0, bottom: 140, left: 0 } };

describe('鏡頭', () => {
  it('直向手機：店面寬度貼齊可用寬度', () => {
    expect(fitZoom(phone, store)).toBeCloseTo((390 - 16) / 700);
  });

  it('預設時店面中心落在可用區域中心', () => {
    const cam = new Camera(phone, store);
    const c = cam.toScreen(store.center);
    expect(c.x).toBeCloseTo(195);
    expect(c.y).toBeCloseTo(60 + (844 - 200) / 2);
  });

  it('以某點縮放時，該點下的場景位置不動', () => {
    const cam = new Camera(phone, store);
    const focus = { x: 120, y: 300 };
    const before = cam.toWorld(focus);
    cam.zoomAt(focus, 1.7);
    const after = cam.toScreen(before);
    expect(after.x).toBeCloseTo(focus.x);
    expect(after.y).toBeCloseTo(focus.y);
  });

  it('縮放倍率限制在上下限內', () => {
    const cam = new Camera(phone, store);
    cam.zoomAt({ x: 0, y: 0 }, 100);
    expect(cam.userZoom).toBe(MAX_USER_ZOOM);
    cam.zoomAt({ x: 0, y: 0 }, 0.0001);
    expect(cam.userZoom).toBe(MIN_USER_ZOOM);
  });

  it('平移有限制：店面不會被拖出畫面', () => {
    const cam = new Camera({ width: 400, height: 400, reserve: none }, store);
    cam.panBy(10_000, -10_000);
    const c = cam.toScreen(store.center);
    const halfW = (store.width * cam.scale) / 2;
    // 店面左緣仍在畫面右緣以內
    expect(c.x - halfW).toBeLessThan(400);
    expect(c.y).toBeGreaterThan(-(store.height * cam.scale) / 2);
  });

  it('reset 回到預設視角', () => {
    const cam = new Camera(phone, store);
    cam.panBy(30, 40);
    cam.zoomAt({ x: 10, y: 10 }, 2);
    expect(cam.isDefault).toBe(false);
    cam.reset();
    expect(cam.isDefault).toBe(true);
  });

  it('reveal：點在區域外時平移到區域邊緣，在區域內則不動', () => {
    const cam = new Camera(phone, store);
    const p = cam.toWorld({ x: 195, y: 700 });
    cam.reveal(p, { top: 60, bottom: 400, left: 0, right: 390 });
    expect(cam.toScreen(p).y).toBeCloseTo(400);
    const pan = cam.pan;
    cam.reveal(p, { top: 60, bottom: 400, left: 0, right: 390 });
    expect(cam.pan).toEqual(pan);
  });
});
