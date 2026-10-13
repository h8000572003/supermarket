import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { PRODUCTS } from '../sim/catalog/products';
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
 * 陳列庫存的畫面：陳列櫃每一層畫該格位實際的商品圖，件數依陳列庫存（偏低 1、有貨 2、滿 3、空 0）；
 * 個別格位空或低於補貨門檻時，在設施上方浮出提示。
 * 只讀取 game 狀態，與家具圖（fixture-sprites）分開。商品圖在 public/assets/products/（本專案自繪 SVG）。
 */

const PRODUCT_BASE = `${import.meta.env.BASE_URL}assets/products/`;
const productUrl = (productId: string) => `${PRODUCT_BASE}${productId}.svg`;

/** 載入所有商品圖；SVG 以較高解析度點陣化，放大檢視時仍清楚 */
export async function loadProductTextures(): Promise<void> {
  await Assets.load(PRODUCTS.map((p) => ({ alias: productUrl(p.id), src: productUrl(p.id), data: { resolution: 3 } })));
}

/** 商品圖的長寬比（viewBox 40×48） */
const PRODUCT_ASPECT = 40 / 48;

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
  shelf: { levels: [36, 15], itemHeight: 17, depth: 0.45, visibleFromBack: true, margin: 0.12 },
  fridge: { levels: [48, 24], itemHeight: 19, depth: 0.04, visibleFromBack: false, margin: 0.18 },
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

/** 一層（一個格位）要畫幾件商品圖 */
export function itemsOnLevel(level: SlotLevel): number {
  return { empty: 0, low: 1, ok: 2, full: 3 }[level];
}

/** 一層最多的件數 */
const MAX_ITEMS = 3;

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
 * 一格陳列櫃上的商品：上下兩層各對應一個格位，畫該格位的商品圖。
 * 回傳的 Container 由呼叫端放進可排序的容器（zIndex 緊接在家具圖之後）；沒有東西可畫時回傳 null。
 */
export function createStockItems(game: Game, fixture: Fixture, tile: GridPoint): Container | null {
  if (fixture.kind !== 'shelf' && fixture.kind !== 'fridge') return null;
  const look = LEVELS[fixture.kind];
  if (!look.visibleFromBack && !FACES_VIEWER[fixture.facing]) return null;
  const def = FIXTURES[fixture.kind];
  const slots = game.slots(fixture.id);

  const [a, b] = frontEdge(tile, fixture.facing);
  const inward = INWARD[fixture.facing];
  const depth = FACES_VIEWER[fixture.facing] ? look.depth : 1 - look.depth;
  const along = (u: number): ScreenPoint =>
    gridToScreen(a.x + (b.x - a.x) * u + inward.x * depth, a.y + (b.y - a.y) * u + inward.y * depth);
  // 讓 u 由畫面左到右
  const flip = along(0).x > along(1).x;
  const at = (u: number): ScreenPoint => along(flip ? 1 - u : u);

  const items: Sprite[] = [];
  slotsOnTile(fixture, tile).forEach((slotIndex, level) => {
    const slot = slots[slotIndex];
    if (!slot?.productId) return;
    const count = itemsOnLevel(slotLevel(totalQty(slot.batches), def.slotCapacity));
    const texture = Assets.get<Texture>(productUrl(slot.productId));
    if (count === 0 || !texture) return;
    const z = look.levels[level] ?? 0;
    const step = (1 - 2 * look.margin) / MAX_ITEMS;
    for (let i = 0; i < count; i++) {
      const p = at(look.margin + step * (i + 0.5));
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.height = look.itemHeight;
      sprite.width = look.itemHeight * PRODUCT_ASPECT;
      sprite.position.set(p.x, p.y - z);
      items.push(sprite);
    }
  });
  if (items.length === 0) return null;

  const c = new Container({ sortableChildren: true });
  // 越靠近畫面下方的越前面
  for (const sprite of items) {
    sprite.zIndex = sprite.y;
    c.addChild(sprite);
  }
  if (fixture.kind === 'fridge') {
    // 玻璃門的反光，讓商品看起來在門後
    const glass = new Graphics();
    const corner = (u: number, h: number) => {
      const p = along(u);
      return [p.x, p.y - h];
    };
    glass.poly([...corner(0.12, 18), ...corner(0.88, 18), ...corner(0.88, 80), ...corner(0.12, 80)]).fill({
      color: 0xbfe6ff,
      alpha: 0.14,
    });
    glass.zIndex = Number.MAX_SAFE_INTEGER;
    c.addChild(glass);
  }
  return c;
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
