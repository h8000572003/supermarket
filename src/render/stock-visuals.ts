import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { PRODUCTS } from '../sim/catalog/products';
import { FIXTURES } from '../sim/catalog/fixtures';
import { RESTOCK_THRESHOLD } from '../sim/agents/restock';
import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Fixture } from '../sim/store/store-layout';
import type { DispatchTarget, Game } from '../sim/game';
import { totalQty } from '../sim/inventory/batch';
import { footprint, footprintTiles, slotAccessTile, staffAccessTiles } from '../sim/store/geometry';
import type { Facing } from '../sim/store/geometry';
import type { GridPoint } from '../sim/store/layout';
import { gridToScreen } from './iso';
import { FRIDGE_SHELF_Z, SHELF_BOARD_Z } from './fixture-art';
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
 * 層高取自 fixture-art 的層板高度（場景座標的像素）。
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
  shelf: { levels: SHELF_BOARD_Z, itemHeight: 16, depth: 0.2, visibleFromBack: true, margin: 0.12 },
  fridge: { levels: FRIDGE_SHELF_Z, itemHeight: 19, depth: 0.04, visibleFromBack: false, margin: 0.18 },
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
    glass.poly([...corner(0.1, 8), ...corner(0.9, 8), ...corner(0.9, 70), ...corner(0.1, 70)]).fill({
      color: 0xbfe6ff,
      alpha: 0.14,
    });
    glass.zIndex = Number.MAX_SAFE_INTEGER;
    c.addChild(glass);
  }
  return c;
}

/**
 * 設施上方的提示：每一格設施一疊，由下往上依序為問題膠囊、派工「!」、換貨 ⇄，只疊實際出現的那幾個。
 * 起點緊貼該種設施的頂部；各格依深度由後往前畫，前方設施的提示自然蓋在後方之上。
 */

/** 各種設施頂部離地的高度＋留白（場景像素），提示從這裡往上疊 */
const BADGE_BASE: Record<FixtureKind, number> = { shelf: 64 + 8, fridge: 86 + 8, register: 50 + 8 };
/** 提示之間的空隙 */
const BADGE_GAP = 3;

const CAPSULE_HEIGHT = 16;
const CAPSULE_STEP = 12;
const DISPATCH_RADIUS = 10;
const CHANGEOVER_W = 22;
const CHANGEOVER_H = 18;

const BADGE_COLOR: Record<'empty' | 'low', number> = { empty: 0xe5484d, low: 0xf5b52e };
const OUTLINE = 0x3b2f2a;
const DISPATCH_COLOR = 0xff9a3c;
const CHANGEOVER_COLOR = 0x5aa9e6;

/** 畫面上的矩形範圍（含描邊） */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 一格設施上要顯示的提示 */
export interface TileBadges {
  readonly kind: FixtureKind;
  readonly tile: GridPoint;
  /** 問題膠囊的點（每個已指定商品的格位一個）；沒有空或偏低的格位時為 null */
  readonly capsule: readonly SlotLevel[] | null;
  readonly dispatch: boolean;
  readonly changeover: boolean;
}

export type BadgeKind = 'capsule' | 'dispatch' | 'changeover';

/** 一個提示在畫面上的中心與範圍 */
export interface PlacedBadge {
  readonly kind: BadgeKind;
  readonly x: number;
  readonly y: number;
  readonly box: ScreenBox;
}

/** 一格設施的頂面中心（提示從這裡往上浮） */
const tileTop = (tile: GridPoint): ScreenPoint => gridToScreen(tile.x + 0.5, tile.y + 0.5);

/** 由下往上排出一格的提示位置（純函式，供測試） */
export function layoutBadges(b: TileBadges): PlacedBadge[] {
  const top = tileTop(b.tile);
  let bottom = top.y - BADGE_BASE[b.kind];
  const placed: PlacedBadge[] = [];
  const push = (kind: BadgeKind, w: number, h: number) => {
    const y = bottom - h / 2;
    placed.push({ kind, x: top.x, y, box: { left: top.x - w / 2 - 1, right: top.x + w / 2 + 1, top: y - h / 2 - 1, bottom: y + h / 2 + 1 } });
    bottom -= h + BADGE_GAP;
  };
  if (b.capsule) push('capsule', b.capsule.length * CAPSULE_STEP + 6, CAPSULE_HEIGHT);
  if (b.dispatch) push('dispatch', DISPATCH_RADIUS * 2, DISPATCH_RADIUS * 2);
  if (b.changeover) push('changeover', CHANGEOVER_W, CHANGEOVER_H);
  return placed;
}

/** 對設施（格位或收銀台）的派工 */
type FixtureDispatchTarget = Exclude<DispatchTarget, { kind: 'nuisance' }>;

/** 派工標記所在的那一格設施（與店員站立格相鄰的那一格），與站立格 */
export function dispatchTiles(fixture: Fixture, target: FixtureDispatchTarget): { tile: GridPoint; stand: GridPoint } | null {
  const def = FIXTURES[fixture.kind];
  const stand = target.kind === 'slot' ? slotAccessTile(def, fixture, target.slotIndex) : staffAccessTiles(def, fixture)[0];
  if (!stand) return null;
  const tiles = footprintTiles(footprint(def, fixture));
  const tile = tiles.find((t) => Math.abs(t.x - stand.x) + Math.abs(t.y - stand.y) === 1) ?? tiles[0];
  return tile ? { tile, stand } : null;
}

/** 收集每一格設施要顯示的提示 */
export function collectTileBadges(game: Game): TileBadges[] {
  const byTile = new Map<string, { kind: FixtureKind; tile: GridPoint; capsule: SlotLevel[] | null; dispatch: boolean; changeover: boolean }>();
  const entry = (fixture: Fixture, tile: GridPoint) => {
    const key = `${fixture.id}:${tile.x},${tile.y}`;
    let e = byTile.get(key);
    if (!e) {
      e = { kind: fixture.kind, tile, capsule: null, dispatch: false, changeover: false };
      byTile.set(key, e);
    }
    return e;
  };
  for (const fixture of game.fixtures) {
    if (fixture.kind !== 'shelf' && fixture.kind !== 'fridge') continue;
    const def = FIXTURES[fixture.kind];
    const slots = game.slots(fixture.id);
    for (const tile of footprintTiles(footprint(def, fixture))) {
      const onTile = slotsOnTile(fixture, tile);
      const levels = onTile
        .map((i) => slots[i])
        .filter((s) => s?.productId)
        .map((s) => slotLevel(totalQty(s!.batches), def.slotCapacity));
      if (levels.some((l) => l === 'empty' || l === 'low')) entry(fixture, tile).capsule = levels;
      if (onTile.some((i) => game.changeover(fixture.id, i))) entry(fixture, tile).changeover = true;
    }
  }
  for (const d of game.dispatches) {
    if (d.kind === 'nuisance') continue;
    const fixture = game.fixture(d.kind === 'slot' ? d.fixtureId : d.registerId);
    const at = fixture && dispatchTiles(fixture, d);
    if (fixture && at) entry(fixture, at.tile).dispatch = true;
  }
  return [...byTile.values()];
}

/** 畫出所有提示；各格依深度由後往前畫 */
export function drawBadges(g: Graphics, game: Game): void {
  g.clear();
  const tiles = collectTileBadges(game).sort((a, b) => a.tile.x + a.tile.y - (b.tile.x + b.tile.y));
  for (const t of tiles) {
    for (const badge of layoutBadges(t)) {
      if (badge.kind === 'capsule') drawCapsule(g, badge, t.capsule ?? []);
      else if (badge.kind === 'dispatch') drawDispatch(g, badge);
      else drawChangeover(g, badge);
    }
  }
}

function drawCapsule(g: Graphics, { x, y }: PlacedBadge, levels: readonly SlotLevel[]): void {
  const w = levels.length * CAPSULE_STEP + 6;
  g.roundRect(x - w / 2, y - CAPSULE_HEIGHT / 2, w, CAPSULE_HEIGHT, CAPSULE_HEIGHT / 2)
    .fill({ color: 0x1f2430, alpha: 0.85 })
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
  levels.forEach((level, i) => {
    const color = level === 'empty' || level === 'low' ? BADGE_COLOR[level] : 0x4cc26b;
    g.circle(x - w / 2 + 9 + i * CAPSULE_STEP, y, 4).fill(color);
  });
}

function drawDispatch(g: Graphics, { x, y }: PlacedBadge): void {
  g.circle(x, y, DISPATCH_RADIUS).fill(DISPATCH_COLOR).stroke({ width: 1.5, color: OUTLINE });
  g.roundRect(x - 1.6, y - 6.5, 3.2, 8, 1.6).fill(0xffffff);
  g.circle(x, y + 4.5, 1.8).fill(0xffffff);
}

/** ⇄：圓角徽章裡兩支相反方向的箭頭（向量繪製） */
function drawChangeover(g: Graphics, { x, y }: PlacedBadge): void {
  g.roundRect(x - CHANGEOVER_W / 2, y - CHANGEOVER_H / 2, CHANGEOVER_W, CHANGEOVER_H, 6).fill(CHANGEOVER_COLOR).stroke({ width: 1.5, color: OUTLINE });
  const half = 6;
  const arrow = (ay: number, dir: 1 | -1) => {
    const tip = x + dir * half;
    const tail = x - dir * half;
    g.moveTo(tail, ay).lineTo(tip - dir * 3, ay).stroke({ width: 2, color: 0xffffff, cap: 'round' });
    g.poly([tip, ay, tip - dir * 4, ay - 3, tip - dir * 4, ay + 3]).fill(0xffffff);
  };
  arrow(y - 3, 1);
  arrow(y + 3, -1);
}
