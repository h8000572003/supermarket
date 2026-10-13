import { Graphics } from 'pixi.js';
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
 * 陳列庫存的畫面：每格陳列櫃依庫存分成空、有貨、滿三種樣子，架上畫通用商品（不分類別）；
 * 個別格位空或低於補貨門檻時，在設施上方浮出提示。
 * 只讀取 game 狀態，與家具圖（fixture-sprites）分開；之後若改用美術圖，只需替換商品的畫法。
 */

/** 滿的時候每層畫幾件商品；有貨時畫一半 */
const ITEMS_PER_LEVEL = 4;

/** 通用商品的配色，依位置輪替 */
const GOODS_COLORS = [0xd9534f, 0xf0ad4e, 0x5bc0de, 0x8e7cc3, 0x5cb85c, 0xe8e2d0];

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

export type TileStock = 'empty' | 'stocked' | 'full';

/** 一格陳列櫃的樣子：所有已指定的格位都空才算空、都滿才算滿，其餘為有貨 */
export function tileStock(levels: readonly SlotLevel[]): TileStock {
  if (levels.every((l) => l === 'empty')) return 'empty';
  if (levels.every((l) => l === 'full')) return 'full';
  return 'stocked';
}

/** 每層要畫幾件 */
export function goodsPerLevel(stock: TileStock): number {
  return stock === 'empty' ? 0 : stock === 'full' ? ITEMS_PER_LEVEL : ITEMS_PER_LEVEL / 2;
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
 * 一格陳列櫃上的商品：兩層一起依這格的樣子（空／有貨／滿）畫。
 * 回傳的 Graphics 由呼叫端放進可排序的容器（zIndex 緊接在家具圖之後）；沒有東西可畫時回傳 null。
 */
export function createStockItems(game: Game, fixture: Fixture, tile: GridPoint): Graphics | null {
  if (fixture.kind !== 'shelf' && fixture.kind !== 'fridge') return null;
  const look = LEVELS[fixture.kind];
  if (!look.visibleFromBack && !FACES_VIEWER[fixture.facing]) return null;
  const def = FIXTURES[fixture.kind];
  const slots = game.slots(fixture.id);
  const levels = slotsOnTile(fixture, tile)
    .map((i) => slots[i])
    .filter((s) => s?.productId)
    .map((s) => slotLevel(totalQty(s!.batches), def.slotCapacity));
  const count = levels.length === 0 ? 0 : goodsPerLevel(tileStock(levels));
  if (count === 0) return null;
  const g = new Graphics();

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

  look.levels.forEach((z0, level) => {
    const z1 = z0 + look.itemHeight;
    const width = (1 - 2 * look.margin) / ITEMS_PER_LEVEL;
    for (let i = 0; i < count; i++) {
      const color = GOODS_COLORS[(i + level * 2 + tile.x + tile.y) % GOODS_COLORS.length] as number;
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

  if (fixture.kind === 'fridge') {
    // 玻璃門的反光，讓商品看起來在門後
    g.poly([...point(0.12, 0, 22), ...point(0.88, 0, 22), ...point(0.88, 0, 82), ...point(0.12, 0, 82)]).fill({
      color: 0xbfe6ff,
      alpha: 0.12,
    });
  }
  return g;
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
