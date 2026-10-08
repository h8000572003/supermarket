import { Graphics } from 'pixi.js';
import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Facing, Footprint } from '../sim/store/geometry';
import { gridToScreen } from './iso';

/**
 * 設施的佔位外觀（等角方塊）。換成 Kenney 素材時只需改這個檔案。
 */
const LOOK: Record<FixtureKind, { color: number; height: number }> = {
  shelf: { color: 0xc98b4e, height: 34 },
  fridge: { color: 0x7fb7d9, height: 50 },
  register: { color: 0x8f6bb3, height: 22 },
};

const FRONT_MARK = 0xfff4c2;

export type BoxStyle = 'normal' | 'selected' | 'ghost-ok' | 'ghost-bad' | 'moving-origin';

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** 深度排序值：越靠近觀看者（x + y 越大）越晚畫 */
export function depthOf(fp: Footprint): number {
  return fp.origin.x + fp.spanX + fp.origin.y + fp.spanY;
}

export function drawFixtureBox(g: Graphics, kind: FixtureKind, fp: Footprint, facing: Facing, style: BoxStyle): void {
  const { height } = LOOK[kind];
  const base =
    style === 'ghost-ok' ? 0x6fd38a : style === 'ghost-bad' ? 0xe0605a : LOOK[kind].color;
  const alpha = style === 'ghost-ok' || style === 'ghost-bad' ? 0.6 : style === 'moving-origin' ? 0.3 : 1;

  const { x: ox, y: oy } = fp.origin;
  const top = gridToScreen(ox, oy);
  const right = gridToScreen(ox + fp.spanX, oy);
  const bottom = gridToScreen(ox + fp.spanX, oy + fp.spanY);
  const left = gridToScreen(ox, oy + fp.spanY);
  const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - height });
  const flat = (...ps: { x: number; y: number }[]) => ps.flatMap((p) => [p.x, p.y]);

  // 可見的兩個側面：南面（left→bottom）與東面（bottom→right）
  g.poly(flat(left, bottom, up(bottom), up(left))).fill({ color: shade(base, 0.72), alpha });
  g.poly(flat(bottom, right, up(right), up(bottom))).fill({ color: shade(base, 0.86), alpha });
  g.poly(flat(up(top), up(right), up(bottom), up(left))).fill({ color: base, alpha });

  // 頂面上沿正面邊緣畫一條標記
  const edges: Record<Facing, [{ x: number; y: number }, { x: number; y: number }]> = {
    north: [top, right],
    east: [right, bottom],
    south: [bottom, left],
    west: [left, top],
  };
  const [a, b] = edges[facing];
  const center = up({ x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 });
  const inset = (p: { x: number; y: number }) => {
    const q = up(p);
    return { x: q.x + (center.x - q.x) * 0.18, y: q.y + (center.y - q.y) * 0.18 };
  };
  const ia = inset(a);
  const ib = inset(b);
  g.moveTo(ia.x, ia.y).lineTo(ib.x, ib.y).stroke({ width: 4, color: FRONT_MARK, alpha, cap: 'round' });

  if (style === 'selected') {
    g.poly(flat(up(top), up(right), up(bottom), up(left)))
      .stroke({ width: 3, color: 0xffffff });
    g.poly(flat(left, bottom, right, up(right), up(top), up(left))).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  }
}
