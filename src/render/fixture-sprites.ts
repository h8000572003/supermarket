import { Container } from 'pixi.js';
import type { FixtureKind } from '../sim/catalog/fixtures';
import { FIXTURES } from '../sim/catalog/fixtures';
import { footprint, footprintTiles } from '../sim/store/geometry';
import type { Placement } from '../sim/store/geometry';
import { drawFridgeTile, drawRegisterTile, drawShelfTile } from './fixture-art';

/**
 * 設施外觀：一般貨架、冷藏櫃與收銀台都由 fixture-art 以程式繪製（與商品圖、人物同風格），每格一個圖層。
 * 換外觀時只需改 fixture-art。
 */

/** 沒有外部圖檔需要載入（保留介面供場景初始化呼叫） */
export async function loadFixtureTextures(): Promise<void> {}

export type FixtureStyle = 'normal' | 'ghost-ok' | 'ghost-bad' | 'moving-origin';

const TINT: Record<FixtureStyle, number> = {
  normal: 0xffffff,
  'ghost-ok': 0x8dff9f,
  'ghost-bad': 0xff6a6a,
  'moving-origin': 0xffffff,
};

const ALPHA: Record<FixtureStyle, number> = {
  normal: 1,
  'ghost-ok': 0.75,
  'ghost-bad': 0.75,
  'moving-origin': 0.3,
};

const DRAW: Record<FixtureKind, typeof drawFridgeTile> = {
  shelf: (tile) => drawShelfTile(tile),
  fridge: drawFridgeTile,
  register: drawRegisterTile,
};

/** 每個佔用格一個 Container，zIndex 依深度（x + y）排序 */
export function createFixtureSprites(kind: FixtureKind, placement: Placement, style: FixtureStyle): Container[] {
  const tiles = footprintTiles(footprint(FIXTURES[kind], placement));
  return tiles.map((tile) => {
    const c = new Container();
    const art = DRAW[kind](tile, placement.facing);
    art.tint = TINT[style];
    art.alpha = ALPHA[style];
    c.addChild(art);
    c.zIndex = (tile.x + tile.y) * 10;
    return c;
  });
}
