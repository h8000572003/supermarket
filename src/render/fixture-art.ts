import { Graphics } from 'pixi.js';
import type { Facing } from '../sim/store/geometry';
import type { GridPoint } from '../sim/store/layout';
import { gridToScreen } from './iso';

/**
 * 一般貨架與冷藏櫃的外觀：以程式依等角投影畫出，風格與商品圖（public/assets/products）一致：
 * 深色描邊、平塗、亮面。層板高度與 stock-visuals 的商品擺放高度對齊。
 */

const OUTLINE = { width: 1.2, color: 0x3b2f2a, alpha: 0.9 };

/** 架上商品的兩層高度（層板上緣），stock-visuals 依此擺放商品 */
export const SHELF_BOARD_Z: readonly [number, number] = [38, 15];
/** 冷藏櫃內兩層的高度 */
export const FRIDGE_SHELF_Z: readonly [number, number] = [48, 24];

const SHELF = {
  post: { top: 0x78909c, side: 0x546e7a, front: 0x607d8b },
  board: { top: 0xf7f4ee, side: 0xd9d2c3, front: 0x43a047 },
  base: { top: 0x90a4ae, side: 0x455a64, front: 0x546e7a },
  height: 64,
  inset: 0.08,
};

const FRIDGE = {
  body: { top: 0xfbfbfa, side: 0xd5dbe0, front: 0xeef1f3 },
  glass: 0x1f3b4d,
  glassShelf: 0x5d8aa8,
  sign: 0x81d4fa,
  kick: 0x455a64,
  height: 86,
  glassBottom: 8,
  glassTop: 70,
  inset: 0.04,
};

interface FaceColors {
  readonly top: number;
  /** 背對正面的側面（較暗） */
  readonly side: number;
  /** 朝畫面右下（+y）或左下（+x）的另一面 */
  readonly front: number;
}

const pt = (x: number, y: number, z: number): number[] => {
  const p = gridToScreen(x, y);
  return [p.x, p.y - z];
};

/**
 * 等角方塊：只畫看得到的三面（+y 面、+x 面、頂面）。
 * +y 面用 colors.front、+x 面用 colors.side，讓光線一致從左上來。
 */
function box(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  colors: FaceColors,
): void {
  g.poly([...pt(x0, y1, z0), ...pt(x1, y1, z0), ...pt(x1, y1, z1), ...pt(x0, y1, z1)])
    .fill(colors.front)
    .stroke(OUTLINE);
  g.poly([...pt(x1, y1, z0), ...pt(x1, y0, z0), ...pt(x1, y0, z1), ...pt(x1, y1, z1)])
    .fill(colors.side)
    .stroke(OUTLINE);
  g.poly([...pt(x0, y0, z1), ...pt(x1, y0, z1), ...pt(x1, y1, z1), ...pt(x0, y1, z1)])
    .fill(colors.top)
    .stroke(OUTLINE);
}

/** 正面所在的那一面是否朝向畫面（看得到） */
const FRONT_VISIBLE: Record<Facing, boolean> = { south: true, east: true, north: false, west: false };

/** 在正面那一面上畫四邊形：u 沿正面由左到右（0–1），z 為高度 */
function onFront(tile: GridPoint, facing: Facing, inset: number) {
  const { x, y } = tile;
  return (u0: number, u1: number, z0: number, z1: number): number[] => {
    // south：y = y+1 面，u 沿 +x；east：x = x+1 面，u 沿 -y（畫面上由左到右）
    const at = (u: number, z: number) =>
      facing === 'south' ? pt(x + inset + (1 - 2 * inset) * u, y + 1 - inset, z) : pt(x + 1 - inset, y + 1 - inset - (1 - 2 * inset) * u, z);
    return [...at(u0, z0), ...at(u1, z0), ...at(u1, z1), ...at(u0, z1)];
  };
}

/** 一格一般貨架：底座、四根立柱、兩層層板與頂板；開放式，從背面也看得到商品 */
export function drawShelfTile(tile: GridPoint): Graphics {
  const g = new Graphics();
  const i = SHELF.inset;
  const x0 = tile.x + i;
  const y0 = tile.y + i;
  const x1 = tile.x + 1 - i;
  const y1 = tile.y + 1 - i;
  const p = 0.07;
  const post = (px: number, py: number) => box(g, px, py, px + p, py + p, 0, SHELF.height, SHELF.post);

  // 後方三根立柱先畫，最靠近畫面的那根最後畫
  post(x0, y0);
  post(x1 - p, y0);
  post(x0, y1 - p);
  box(g, x0, y0, x1, y1, 0, 6, SHELF.base);
  box(g, x0, y0, x1, y1, SHELF_BOARD_Z[1] - 3, SHELF_BOARD_Z[1], SHELF.board);
  box(g, x0, y0, x1, y1, SHELF_BOARD_Z[0] - 3, SHELF_BOARD_Z[0], SHELF.board);
  box(g, x0, y0, x1, y1, SHELF.height - 3, SHELF.height, SHELF.board);
  post(x1 - p, y1 - p);
  return g;
}

/** 一格冷藏櫃：白色櫃體、頂部燈箱；正面朝畫面時畫出玻璃門、內層與把手 */
export function drawFridgeTile(tile: GridPoint, facing: Facing): Graphics {
  const g = new Graphics();
  const i = FRIDGE.inset;
  const x0 = tile.x + i;
  const y0 = tile.y + i;
  const x1 = tile.x + 1 - i;
  const y1 = tile.y + 1 - i;
  box(g, x0, y0, x1, y1, 0, FRIDGE.height, FRIDGE.body);
  if (!FRONT_VISIBLE[facing]) return g;

  const face = onFront(tile, facing, i);
  // 底部踢腳板與頂部燈箱
  g.poly(face(0, 1, 0, 5)).fill(FRIDGE.kick).stroke(OUTLINE);
  g.poly(face(0.06, 0.94, FRIDGE.glassTop + 4, FRIDGE.height - 4)).fill(FRIDGE.sign).stroke(OUTLINE);
  // 玻璃門：深色內部、兩層層架
  g.poly(face(0.1, 0.9, FRIDGE.glassBottom, FRIDGE.glassTop)).fill(FRIDGE.glass).stroke(OUTLINE);
  for (const z of FRIDGE_SHELF_Z) {
    g.poly(face(0.1, 0.9, z - 1.5, z)).fill(FRIDGE.glassShelf);
  }
  // 玻璃上緣的反光與把手
  g.poly(face(0.14, 0.3, FRIDGE.glassBottom + 6, FRIDGE.glassTop - 4)).fill({ color: 0xffffff, alpha: 0.12 });
  g.poly(face(0.84, 0.87, 26, 52)).fill(0xb0bec5).stroke(OUTLINE);
  return g;
}

const REGISTER = {
  counter: { top: 0xf7f4ee, side: 0x9e8a70, front: 0xc4ad8c },
  panel: 0x43a047,
  machine: { top: 0x90a4ae, side: 0x455a64, front: 0x607d8b },
  screen: 0x80deea,
  height: 30,
  inset: 0.06,
};

/** 往店員側（背面）的單位向量 */
const TO_STAFF: Record<Facing, GridPoint> = {
  south: { x: 0, y: -1 },
  north: { x: 0, y: 1 },
  east: { x: -1, y: 0 },
  west: { x: 1, y: 0 },
};

/**
 * 收銀台：木紋櫃台、正面綠色面板；檯面上放收銀機，螢幕立在店員側。
 */
export function drawRegisterTile(tile: GridPoint, facing: Facing): Graphics {
  const g = new Graphics();
  const i = REGISTER.inset;
  const x0 = tile.x + i;
  const y0 = tile.y + i;
  const x1 = tile.x + 1 - i;
  const y1 = tile.y + 1 - i;
  box(g, x0, y0, x1, y1, 0, REGISTER.height, REGISTER.counter);
  if (FRONT_VISIBLE[facing]) {
    const face = onFront(tile, facing, i);
    g.poly(face(0.08, 0.92, 4, REGISTER.height - 6)).fill(REGISTER.panel).stroke(OUTLINE);
    g.poly(face(0.08, 0.92, 12, 15)).fill(0xffffff);
  }
  // 收銀機本體（檯面中央偏店員側）與立起的螢幕
  const s = TO_STAFF[facing];
  const cx = tile.x + 0.5 + s.x * 0.12;
  const cy = tile.y + 0.5 + s.y * 0.12;
  const h = 0.2;
  box(g, cx - h, cy - h, cx + h, cy + h, REGISTER.height, REGISTER.height + 7, REGISTER.machine);
  const sx = cx + s.x * 0.22;
  const sy = cy + s.y * 0.22;
  const w = 0.17;
  const t = 0.04;
  const [ax0, ax1] = s.x === 0 ? [sx - w, sx + w] : [sx - t, sx + t];
  const [ay0, ay1] = s.y === 0 ? [sy - w, sy + w] : [sy - t, sy + t];
  box(g, ax0, ay0, ax1, ay1, REGISTER.height + 7, REGISTER.height + 20, {
    top: REGISTER.machine.top,
    side: s.x !== 0 ? REGISTER.screen : REGISTER.machine.side,
    front: s.y !== 0 ? REGISTER.screen : REGISTER.machine.front,
  });
  return g;
}
