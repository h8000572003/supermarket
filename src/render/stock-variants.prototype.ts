/**
 * PROTOTYPE（拋棄式）：陳列庫存的幾種畫法，用 `?variant=A|B|C|D` 切換比較。
 * 問題：「格位空／有貨／滿」在店面上要怎麼呈現最好？
 * A＝方案三＋二（目前實作）；B、C＝方案四（整格三態家具圖，原型以程式畫的通用商品模擬）＋方案二的兩種提示。
 * 選定後只把勝出的做法正式寫進 stock-visuals.ts，這個檔案不進 master。
 */
import { Graphics } from 'pixi.js';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { Game } from '../sim/game';
import { totalQty } from '../sim/inventory/batch';
import { footprint, footprintTiles } from '../sim/store/geometry';
import { TILE_HEIGHT, gridToScreen } from './iso';
import { slotLevel } from './stock-visuals';
import type { SlotLevel } from './stock-visuals';

export const STOCK_VARIANTS = ['A', 'B', 'C'] as const;
export type StockVariant = (typeof STOCK_VARIANTS)[number];

export const STOCK_VARIANT_NAMES: Record<StockVariant, string> = {
  A: '方案三＋二：架上商品（類別色）＋問題膠囊',
  B: '方案四＋二：三態家具圖＋問題膠囊',
  C: '方案四＋二：三態家具圖＋常駐庫存條',
};

export function currentStockVariant(): StockVariant {
  const v = new URLSearchParams(window.location.search).get('variant');
  return (STOCK_VARIANTS as readonly string[]).includes(v ?? '') ? (v as StockVariant) : 'A';
}

const LEVEL_COLOR: Record<SlotLevel, number> = { empty: 0xe5484d, low: 0xf5b52e, ok: 0x4cc26b, full: 0x2f9e55 };

interface SlotView {
  fixtureId: string;
  index: number;
  productId: string;
  qty: number;
  capacity: number;
  level: SlotLevel;
}

function displaySlots(game: Game) {
  return game.fixtures
    .filter((f) => f.kind === 'shelf' || f.kind === 'fridge')
    .map((f) => {
      const def = FIXTURES[f.kind];
      const slots: SlotView[] = [];
      game.slots(f.id).forEach((s, index) => {
        if (!s.productId) return;
        const qty = totalQty(s.batches);
        slots.push({ fixtureId: f.id, index, productId: s.productId, qty, capacity: def.slotCapacity, level: slotLevel(qty, def.slotCapacity) });
      });
      return { fixture: f, def, slots, tiles: footprintTiles(footprint(def, f)) };
    });
}

/** C：每個陳列櫃上方常駐一組水平庫存條，每個格位一條，長度＝陳列庫存比例 */
export function drawBars(g: Graphics, game: Game): void {
  g.clear();
  for (const { fixture, tiles, slots } of displaySlots(game)) {
    if (slots.length === 0) continue;
    const cx = tiles.reduce((s, t) => s + t.x + 0.5, 0) / tiles.length;
    const cy = tiles.reduce((s, t) => s + t.y + 0.5, 0) / tiles.length;
    const top = gridToScreen(cx, cy);
    const lift = fixture.kind === 'fridge' ? TILE_HEIGHT * 3.6 : TILE_HEIGHT * 2.2;
    const w = 44;
    const h = 5;
    const x0 = top.x - w / 2;
    const y0 = top.y - lift - slots.length * (h + 2);
    g.roundRect(x0 - 4, y0 - 4, w + 8, slots.length * (h + 2) + 6, 4).fill({ color: 0x1f2430, alpha: 0.85 });
    slots.forEach((s, i) => {
      const y = y0 + i * (h + 2);
      g.rect(x0, y, w, h).fill({ color: 0x555b6a });
      if (s.qty > 0) g.rect(x0, y, (w * s.qty) / s.capacity, h).fill(LEVEL_COLOR[s.level]);
    });
  }
}

