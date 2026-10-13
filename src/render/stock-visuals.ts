import { Graphics } from 'pixi.js';
import { PRODUCTS, productById } from '../sim/catalog/products';
import type { CategoryId } from '../sim/catalog/products';
import { FIXTURES } from '../sim/catalog/fixtures';
import { RESTOCK_THRESHOLD } from '../sim/agents/restock';
import type { Fixture } from '../sim/store/store-layout';
import type { Game } from '../sim/game';
import { totalQty } from '../sim/inventory/batch';
import { footprint, footprintTiles, slotAccessTile } from '../sim/store/geometry';
import type { Facing } from '../sim/store/geometry';
import type { GridPoint } from '../sim/store/layout';
import { TILE_HEIGHT, gridToScreen } from './iso';
import type { ScreenPoint } from './iso';

/**
 * 陳列庫存的畫面：架上依陳列庫存畫出商品，空或低於補貨門檻時在設施上方浮出提示。
 * 只讀取 game 狀態，與家具圖（fixture-sprites）分開，換素材時兩邊獨立調整。
 */

/** 商品類別的顏色 */
const CATEGORY_COLOR: Record<CategoryId, number> = {
  drink: 0x3d9be0,
  fresh: 0x5cb85c,
  snack: 0xf0a030,
  noodle: 0xe0554a,
  daily: 0xb9a7e8,
};

/** 一個格位最多畫幾件商品（陳列庫存依比例換算） */
const ITEMS_PER_SLOT = 4;

/**
 * 每種陳列櫃的兩層（一格設施放兩個格位）：商品底部離地的高度、商品高度、畫在離正面多深的平面。
 * 數值配合 Kenney 家具圖調整（場景座標的像素）。
 */
interface ShelfLevels {
  readonly levels: readonly [number, number];
  readonly itemHeight: number;
  readonly depth: number;
  /** 正面朝向畫面外時（看到背面）是否仍畫商品：開放式貨架看得到，冷藏櫃的玻璃門看不到 */
  readonly visibleFromBack: boolean;
  /** 沿正面方向留白的比例 */
  readonly margin: number;
}

const LEVELS: Record<'shelf' | 'fridge', ShelfLevels> = {
  shelf: { levels: [36, 15], itemHeight: 8, depth: 0.45, visibleFromBack: true, margin: 0.1 },
  fridge: { levels: [50, 26], itemHeight: 12, depth: 0.02, visibleFromBack: false, margin: 0.2 },
};

/** 正面的那條邊（網格座標的兩端點） */
function frontEdge(tile: GridPoint, facing: Facing): [GridPoint, GridPoint] {
  const { x, y } = tile;
  switch (facing) {
    case 'south':
      return [{ x, y: y + 1 }, { x: x + 1, y: y + 1 }];
    case 'north':
      return [{ x, y }, { x: x + 1, y }];
    case 'east':
      return [{ x: x + 1, y }, { x: x + 1, y: y + 1 }];
    case 'west':
      return [{ x, y }, { x, y: y + 1 }];
  }
}

/** 往設施內部（背面方向）的單位向量 */
const INWARD: Record<Facing, GridPoint> = {
  south: { x: 0, y: -1 },
  north: { x: 0, y: 1 },
  east: { x: -1, y: 0 },
  west: { x: 1, y: 0 },
};

/** 畫面上看得到正面的朝向（朝向畫面右下或左下） */
const FACES_VIEWER: Record<Facing, boolean> = { south: true, east: true, north: false, west: false };

export type SlotLevel = 'empty' | 'low' | 'ok' | 'full';

/** 格位陳列庫存的狀態：空、低於補貨門檻、有貨、滿 */
export function slotLevel(qty: number, capacity: number): SlotLevel {
  if (qty <= 0) return 'empty';
  if (qty >= capacity) return 'full';
  if (qty < capacity * RESTOCK_THRESHOLD) return 'low';
  return 'ok';
}

/** 依陳列庫存換算要畫幾件：有貨至少 1 件，滿才畫滿 */
export function itemsToDraw(qty: number, capacity: number): number {
  if (qty <= 0) return 0;
  if (qty >= capacity) return ITEMS_PER_SLOT;
  return Math.min(ITEMS_PER_SLOT - 1, Math.max(1, Math.round((qty / capacity) * ITEMS_PER_SLOT)));
}

/** 同類別不同商品略有深淺，方便分辨 */
function productColor(productId: string): number {
  const product = productById(productId);
  if (!product) return 0x999999;
  const index = PRODUCTS.filter((p) => p.category === product.category).indexOf(product);
  return shade(CATEGORY_COLOR[product.category], 1 - (index % 3) * 0.14);
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** 一格設施上的兩個格位（依取用格對應） */
function slotsOnTile(fixture: Fixture, tile: GridPoint): number[] {
  const def = FIXTURES[fixture.kind];
  const result: number[] = [];
  for (let i = 0; i < def.slots; i++) {
    const access = slotAccessTile(def, fixture, i);
    if (Math.abs(access.x - tile.x) + Math.abs(access.y - tile.y) === 1) result.push(i);
  }
  return result;
}

/**
 * 一格陳列櫃上的商品，回傳的 Graphics 由呼叫端放進可排序的容器（zIndex 緊接在家具圖之後）。
 * 沒有東西可畫時回傳 null。
 */
export function createStockItems(game: Game, fixture: Fixture, tile: GridPoint): Graphics | null {
  if (fixture.kind !== 'shelf' && fixture.kind !== 'fridge') return null;
  const look = LEVELS[fixture.kind];
  if (!look.visibleFromBack && !FACES_VIEWER[fixture.facing]) return null;
  const def = FIXTURES[fixture.kind];
  const slots = game.slots(fixture.id);
  const g = new Graphics();
  let drawn = false;

  const [a, b] = frontEdge(tile, fixture.facing);
  const inward = INWARD[fixture.facing];
  const depth = FACES_VIEWER[fixture.facing] ? look.depth : 1 - look.depth;
  const along = (u: number, d: number): ScreenPoint => {
    const p = { x: a.x + (b.x - a.x) * u + inward.x * d, y: a.y + (b.y - a.y) * u + inward.y * d };
    return gridToScreen(p.x, p.y);
  };
  // 讓 u 由畫面左到右
  const flip = along(0, depth).x > along(1, depth).x;
  const point = (u: number, d: number, z: number): number[] => {
    const p = along(flip ? 1 - u : u, d);
    return [p.x, p.y - z];
  };

  slotsOnTile(fixture, tile).forEach((slotIndex, level) => {
    const slot = slots[slotIndex];
    if (!slot?.productId) return;
    const count = itemsToDraw(totalQty(slot.batches), def.slotCapacity);
    if (count === 0) return;
    drawn = true;
    const color = productColor(slot.productId);
    const z0 = look.levels[level] ?? 0;
    const z1 = z0 + look.itemHeight;
    const width = (1 - 2 * look.margin) / ITEMS_PER_SLOT;
    for (let i = 0; i < count; i++) {
      const u0 = look.margin + i * width + width * 0.06;
      const u1 = look.margin + (i + 1) * width - width * 0.06;
      // 正面
      g.poly([...point(u0, depth, z0), ...point(u1, depth, z0), ...point(u1, depth, z1), ...point(u0, depth, z1)])
        .fill(color)
        .stroke({ width: 0.75, color: shade(color, 0.6) });
      // 頂面
      const back = depth + 0.22;
      g.poly([...point(u0, depth, z1), ...point(u1, depth, z1), ...point(u1, back, z1), ...point(u0, back, z1)]).fill(
        shade(color, 1.25),
      );
    }
  });

  if (fixture.kind === 'fridge' && drawn) {
    // 玻璃門的反光，讓商品看起來在門後
    g.poly([...point(0.12, 0, 22), ...point(0.88, 0, 22), ...point(0.88, 0, 82), ...point(0.12, 0, 82)]).fill({
      color: 0xbfe6ff,
      alpha: 0.12,
    });
  }
  return drawn ? g : null;
}

/** 提示浮在設施上方的高度 */
const BADGE_LIFT: Record<'shelf' | 'fridge', number> = { shelf: TILE_HEIGHT * 2.2, fridge: TILE_HEIGHT * 3.6 };

const BADGE_COLOR: Record<'empty' | 'low', number> = { empty: 0xe5484d, low: 0xf5b52e };

/**
 * 空或低於補貨門檻的格位：在那一格設施上方浮一個小膠囊，每個格位一個點（紅＝空、黃＝偏低、綠＝正常）。
 * 全部正常時不畫，避免畫面雜亂。
 */
export function drawStockAlerts(g: Graphics, game: Game): void {
  g.clear();
  for (const fixture of game.fixtures) {
    if (fixture.kind !== 'shelf' && fixture.kind !== 'fridge') continue;
    const def = FIXTURES[fixture.kind];
    const slots = game.slots(fixture.id);
    for (const tile of footprintTiles(footprint(def, fixture))) {
      const levels = slotsOnTile(fixture, tile)
        .map((i) => slots[i])
        .filter((s) => s?.productId)
        .map((s) => slotLevel(totalQty(s!.batches), def.slotCapacity));
      if (!levels.some((l) => l === 'empty' || l === 'low')) continue;
      const top = gridToScreen(tile.x + 0.5, tile.y + 0.5);
      const y = top.y - BADGE_LIFT[fixture.kind];
      const w = levels.length * 12 + 6;
      g.roundRect(top.x - w / 2, y - 8, w, 16, 8).fill({ color: 0x1f2430, alpha: 0.85 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
      levels.forEach((level, i) => {
        const cx = top.x - w / 2 + 9 + i * 12;
        const color = level === 'empty' || level === 'low' ? BADGE_COLOR[level] : 0x4cc26b;
        g.circle(cx, y, 4).fill(color);
      });
    }
  }
}
