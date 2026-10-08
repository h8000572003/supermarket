import { Assets, Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import { footprint, footprintTiles, rotateClockwise } from '../sim/store/geometry';
import type { Facing, Placement } from '../sim/store/geometry';
import { TILE_WIDTH, gridToScreen } from './iso';

/**
 * 設施外觀：Kenney Furniture Kit（CC0）的等角 PNG，每格一張。
 * 換素材時只需改這個檔案。
 */
const BASE = `${import.meta.env.BASE_URL}assets/kenney-furniture/`;

type Suffix = 'NE' | 'NW' | 'SE' | 'SW';

/** 一般家具：檔名後綴即正面在畫面上的方向 */
const STANDARD: Record<Facing, Suffix> = { north: 'NE', east: 'SE', south: 'SW', west: 'NW' };
/** kitchenFridge 的玻璃門不在模型正面：依畫面上玻璃門所在的面挑圖 */
const GLASS_FRIDGE: Record<Facing, Suffix> = { north: 'SE', east: 'NE', south: 'NW', west: 'SW' };

interface Layer {
  readonly model: string;
  readonly suffixes: Record<Facing, Suffix>;
  /** 相對於朝向再轉幾個 90°（如收銀螢幕朝向店員） */
  readonly turn?: number;
  /** 往上抬高的像素（疊在其他物件上） */
  readonly lift?: number;
  /** 相對於填滿一格寬度的縮放 */
  readonly size?: number;
}

const LOOKS: Record<FixtureKind, readonly Layer[]> = {
  shelf: [{ model: 'bookcaseOpenLow', suffixes: STANDARD }],
  fridge: [{ model: 'kitchenFridge', suffixes: GLASS_FRIDGE }],
  register: [
    { model: 'kitchenBar', suffixes: STANDARD },
    { model: 'computerScreen', suffixes: STANDARD, turn: 2, lift: 34, size: 0.5 },
  ],
};

const FILL = 0.92;

export async function loadFixtureTextures(): Promise<void> {
  const urls = new Set<string>();
  for (const layers of Object.values(LOOKS)) {
    for (const layer of layers) {
      for (const suffix of Object.values(layer.suffixes)) urls.add(`${BASE}${layer.model}_${suffix}.png`);
    }
  }
  await Assets.load([...urls]);
}

function texture(layer: Layer, facing: Facing): Texture {
  let f = facing;
  for (let i = 0; i < (layer.turn ?? 0); i++) f = rotateClockwise(f);
  return Assets.get<Texture>(`${BASE}${layer.model}_${layer.suffixes[f]}.png`);
}

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

/** 每個佔用格一個 Container，zIndex 依深度（x + y）排序 */
export function createFixtureSprites(kind: FixtureKind, placement: Placement, style: FixtureStyle): Container[] {
  const tiles = footprintTiles(footprint(FIXTURES[kind], placement));
  return tiles.map((tile) => {
    const c = new Container();
    const bottom = gridToScreen(tile.x + 1, tile.y + 1);
    for (const layer of LOOKS[kind]) {
      const tex = texture(layer, placement.facing);
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.scale.set(((TILE_WIDTH * FILL) / tex.width) * (layer.size ?? 1));
      s.position.set(bottom.x, bottom.y - (layer.lift ?? 0) - (layer.size ? (TILE_WIDTH / 4) * (1 - layer.size) : 0));
      s.tint = TINT[style];
      s.alpha = ALPHA[style];
      c.addChild(s);
    }
    c.zIndex = (tile.x + tile.y) * 10;
    return c;
  });
}

