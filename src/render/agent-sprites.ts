import { Container, Graphics, Text } from 'pixi.js';
import type { CustomerType } from '../sim/agents/demand';

/**
 * 顧客與店員的外觀：以程式繪製的 Q 版小人，風格與商品圖、貨架一致（深色描邊、平塗、亮面）。
 * 原點在腳底中心；可顯示搬運中的紙箱、手上的購物籃與心情泡泡，並依行走方向左右翻面。
 */

const OUTLINE = { width: 1.2, color: 0x3b2f2a, alpha: 0.95 };

/** 沒有外部圖檔需要載入（保留介面供場景初始化呼叫） */
export async function loadAgentTextures(): Promise<void> {}

export type HairStyle = 'short' | 'long' | 'bun' | 'cap';

export interface PersonLook {
  readonly shirt: number;
  readonly pants: number;
  readonly hair: number;
  readonly skin: number;
  readonly hairStyle: HairStyle;
  /** 店員：白襯衫加制服背心與帽子 */
  readonly uniform?: boolean;
  /** 顧客類型的配件：上班族領帶、學生書包、家庭大提籃 */
  readonly accessory?: Accessory;
  /** 配件的主色 */
  readonly accessoryColor?: number;
}

export type Accessory = 'tie' | 'backpack' | 'big-basket';

const ACCESSORY: Record<CustomerType, Accessory> = { office: 'tie', student: 'backpack', family: 'big-basket' };

export const STAFF_LOOK: PersonLook = {
  shirt: 0xffffff,
  pants: 0x37474f,
  hair: 0x3b2a20,
  skin: 0xf3cfa3,
  hairStyle: 'cap',
  uniform: true,
};

const SHIRTS = [0xe57373, 0xffb74d, 0x81c784, 0xba68c8, 0x4fc3f7, 0xf06292, 0xfff176, 0x90a4ae];
const PANTS = [0x37474f, 0x5d4037, 0x3f51b5, 0x546e7a, 0x2e7d32];
const HAIRS = [0x2b1d14, 0x5a3a22, 0x8a6a3a, 0x1d1d1d, 0xb0b0b0, 0xc0392b];
const SKINS = [0xf3cfa3, 0xe8b88a, 0xc68e62, 0x8d5a3b];
const STYLES: readonly HairStyle[] = ['short', 'long', 'bun', 'short', 'cap'];
/** 上班族：淺色襯衫、深色西裝褲、不戴帽 */
const OFFICE_SHIRTS = [0xffffff, 0xd6e9fb, 0xeceff1, 0xfff8e1];
const OFFICE_PANTS = [0x263238, 0x37474f, 0x1a237e];
const OFFICE_STYLES: readonly HairStyle[] = ['short', 'long', 'bun', 'short'];
const TIES = [0xc62828, 0x1565c0, 0x6a1b9a, 0x2e7d32];
const BACKPACKS = [0x1e88e5, 0xe53935, 0xfdd835, 0x43a047, 0x8e24aa, 0xfb8c00];

/** 依顧客 id 決定固定的外觀；依類型加上配件（上班族領帶、學生書包、家庭大提籃） */
export function customerLook(id: string, type?: CustomerType): PersonLook {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length] as T;
  const office = type === 'office';
  // 短 id 的雜湊值很小，高位元幾乎都是 0：配件顏色另用打散過的雜湊挑，才會有變化
  const mixed = Math.imul(h ^ (h >>> 7), 0x9e3779b1) >>> 0;
  const colors = type === 'office' ? TIES : BACKPACKS;
  return {
    shirt: pick(office ? OFFICE_SHIRTS : SHIRTS, 0),
    pants: pick(office ? OFFICE_PANTS : PANTS, 4),
    hair: pick(HAIRS, 8),
    skin: pick(SKINS, 12),
    hairStyle: pick(office ? OFFICE_STYLES : STYLES, 16),
    ...(type && {
      accessory: ACCESSORY[type],
      accessoryColor: colors[(mixed >>> 13) % colors.length] as number,
    }),
  };
}

export type Mood = 'stockout' | 'impatient' | null;

function drawPerson(g: Graphics, look: PersonLook): void {
  // 影子
  g.ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: 0.2 });
  // 長髮在身體後面
  if (look.hairStyle === 'long') g.roundRect(-7, -33, 14, 17, 5).fill(look.hair).stroke(OUTLINE);
  // 書包在身體後面（從側後方露出）
  if (look.accessory === 'backpack') drawBackpack(g, look.accessoryColor ?? 0x1e88e5);
  // 腳與鞋
  g.roundRect(-5, -9, 4, 9, 1.5).fill(look.pants).stroke(OUTLINE);
  g.roundRect(1, -9, 4, 9, 1.5).fill(look.pants).stroke(OUTLINE);
  // 手臂（身體後方先畫）
  g.roundRect(-9, -21, 4, 10, 2).fill(look.shirt).stroke(OUTLINE);
  g.roundRect(5, -21, 4, 10, 2).fill(look.shirt).stroke(OUTLINE);
  g.circle(-7, -10.5, 2).fill(look.skin).stroke(OUTLINE);
  g.circle(7, -10.5, 2).fill(look.skin).stroke(OUTLINE);
  // 身體
  g.roundRect(-6, -23, 12, 15, 4).fill(look.shirt).stroke(OUTLINE);
  if (look.uniform) {
    // 制服背心：綠色、白色條紋與名牌
    g.roundRect(-6, -21, 12, 13, 3).fill(0x43a047).stroke(OUTLINE);
    g.rect(-6, -16, 12, 2).fill(0xffffff);
    g.roundRect(1, -20, 4, 2.5, 0.8).fill(0xfff59d);
  } else {
    // 衣服亮面
    g.roundRect(-4.5, -21, 2.5, 9, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
  }
  if (look.accessory === 'tie') drawTie(g, look.accessoryColor ?? 0xc62828);
  if (look.accessory === 'backpack') {
    // 書包背帶
    const strap = { width: 1.8, color: darken(look.accessoryColor ?? 0x1e88e5) };
    g.moveTo(-4, -22.5).lineTo(-4.5, -13).stroke(strap);
    g.moveTo(4, -22.5).lineTo(4.5, -13).stroke(strap);
  }
  if (look.accessory === 'big-basket') drawBigBasket(g);
  // 頭
  g.circle(0, -30, 6.5).fill(look.skin).stroke(OUTLINE);
  g.circle(-2.3, -29.5, 0.9).fill(0x3b2f2a);
  g.circle(2.3, -29.5, 0.9).fill(0x3b2f2a);
  g.circle(-3.6, -27.6, 1.1).fill({ color: 0xff8a80, alpha: 0.5 });
  g.circle(3.6, -27.6, 1.1).fill({ color: 0xff8a80, alpha: 0.5 });
  // 頭髮或帽子
  switch (look.hairStyle) {
    case 'cap': {
      const cap = look.uniform ? 0x43a047 : look.shirt;
      g.moveTo(0 - 6.8, -31).arc(0, -31, 6.8, Math.PI, 0).fill(cap).stroke(OUTLINE);
      g.roundRect(-1, -32.5, 9, 2.4, 1).fill(cap).stroke(OUTLINE);
      break;
    }
    case 'bun':
      g.circle(0, -38, 3).fill(look.hair).stroke(OUTLINE);
      g.moveTo(0 - 6.8, -31).arc(0, -31, 6.8, Math.PI, 0).fill(look.hair).stroke(OUTLINE);
      break;
    default:
      g.moveTo(0 - 6.8, -31).arc(0, -31, 6.8, Math.PI, 0).fill(look.hair).stroke(OUTLINE);
      g.roundRect(-6.8, -32, 4, 4, 1.5).fill(look.hair);
  }
}

/** 顏色調暗（配件的陰影與背帶） */
function darken(color: number, f = 0.7): number {
  const r = Math.round(((color >> 16) & 0xff) * f);
  const gg = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (gg << 8) | b;
}

/** 上班族的領帶：白領口、領結與往下變寬的領帶 */
function drawTie(g: Graphics, color: number): void {
  g.poly([-3.5, -23, 0, -20.5, 3.5, -23, 2.5, -21, 0, -19.5, -2.5, -21]).fill(0xffffff).stroke(OUTLINE);
  g.poly([-1.3, -21, 1.3, -21, 0.9, -19.2, -0.9, -19.2]).fill(color).stroke({ ...OUTLINE, width: 0.9 });
  g.poly([-0.9, -19.2, 0.9, -19.2, 2, -12.5, 0, -10.5, -2, -12.5]).fill(color).stroke({ ...OUTLINE, width: 0.9 });
  g.moveTo(-1.2, -16).lineTo(1.4, -14.6).stroke({ width: 0.8, color: 0xffffff, alpha: 0.5 });
}

/** 學生的書包：揹在身後、從身體兩側露出 */
function drawBackpack(g: Graphics, color: number): void {
  g.roundRect(-10.5, -25, 21, 15, 4).fill(color).stroke(OUTLINE);
  g.roundRect(-10.5, -17, 4, 6, 1.5).fill(darken(color)).stroke({ ...OUTLINE, width: 0.9 });
  g.roundRect(6.5, -17, 4, 6, 1.5).fill(darken(color)).stroke({ ...OUTLINE, width: 0.9 });
  g.moveTo(-6, -27).arc(0, -25, 4, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 1.6, color: darken(color) });
}

/** 家庭的大提籃：掛在手臂上、比一般購物籃大，裝著蔬菜與長棍麵包 */
function drawBigBasket(g: Graphics): void {
  // 露出籃子的貨
  g.roundRect(-17.5, -22, 3, 10, 1.5).fill(0xe0b070).stroke({ ...OUTLINE, width: 0.9 });
  g.circle(-11, -15.5, 2.6).fill(0x66bb6a).stroke({ ...OUTLINE, width: 0.9 });
  g.circle(-14.5, -15, 2.2).fill(0xff7043).stroke({ ...OUTLINE, width: 0.9 });
  // 提把
  g.moveTo(-19, -14).arc(-12.5, -14, 6.5, Math.PI, 0).stroke({ width: 1.8, color: 0x6d4c2f });
  // 籃身（藤編）
  g.poly([-20, -14, -5, -14, -6.5, -3, -18.5, -3]).fill(0xc8955a).stroke(OUTLINE);
  g.moveTo(-19.3, -10.5).lineTo(-5.7, -10.5).stroke({ width: 0.9, color: 0x8d6e4a });
  g.moveTo(-18.8, -6.8).lineTo(-6.2, -6.8).stroke({ width: 0.9, color: 0x8d6e4a });
  g.rect(-20.5, -15, 16, 2).fill(0xa47148).stroke({ ...OUTLINE, width: 0.9 });
}

/** 店員搬運中的紙箱 */
function drawCarton(g: Graphics): void {
  g.poly([-8, -40, 0, -44, 8, -40, 0, -36]).fill(0xe0b77a).stroke(OUTLINE);
  g.poly([-8, -40, 0, -36, 0, -28, -8, -32]).fill(0xc8955a).stroke(OUTLINE);
  g.poly([0, -36, 8, -40, 8, -32, 0, -28]).fill(0xb07d47).stroke(OUTLINE);
  g.moveTo(-4, -42).lineTo(4, -38).stroke({ width: 1.6, color: 0xf5e6c8 });
}

/** 紅色購物籃 */
function drawBasket(g: Graphics): void {
  g.moveTo(10 - 3.5, -15).arc(10, -15, 3.5, Math.PI, 0).stroke({ width: 1.4, color: 0x3b2f2a });
  g.poly([5.5, -15, 14.5, -15, 13.5, -9, 6.5, -9]).fill(0xe53935).stroke(OUTLINE);
  g.moveTo(6, -12.5).lineTo(14, -12.5).stroke({ width: 1, color: 0xffcdd2 });
}

export class PersonSprite extends Container {
  private readonly figure = new Container();
  private readonly box: Graphics;
  private readonly basket: Graphics;
  private readonly bubble: Container;
  private readonly bubbleText: Text;
  private readonly bubbleBg: Graphics;
  private mood: Mood = null;
  private lastX: number | null = null;

  constructor(look: PersonLook) {
    super();
    const body = new Graphics();
    drawPerson(body, look);
    this.figure.addChild(body);

    this.basket = new Graphics();
    drawBasket(this.basket);
    this.basket.visible = false;
    this.figure.addChild(this.basket);

    this.box = new Graphics();
    drawCarton(this.box);
    this.box.visible = false;
    this.figure.addChild(this.box);
    this.addChild(this.figure);

    this.bubble = new Container();
    this.bubbleBg = new Graphics();
    this.bubbleText = new Text({ text: '', style: { fontSize: 11, fontWeight: '700', fill: 0xffffff } });
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.position.set(11, -46);
    this.bubble.visible = false;
    this.addChild(this.bubble);
  }

  set carrying(value: boolean) {
    this.box.visible = value;
  }

  set holdingBasket(value: boolean) {
    this.basket.visible = value;
  }

  /** 依畫面上的水平移動方向翻面（泡泡不翻） */
  faceToward(x: number): void {
    if (this.lastX !== null && Math.abs(x - this.lastX) > 0.05) {
      this.figure.scale.x = x < this.lastX ? -1 : 1;
    }
    this.lastX = x;
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.bubble.visible = mood !== null;
    if (!mood) return;
    const color = mood === 'stockout' ? 0xe53935 : 0xffa000;
    this.bubbleBg
      .clear()
      .poly([-3, 6, -6, 12, 3, 7])
      .fill(color)
      .stroke(OUTLINE)
      .circle(0, 0, 8.5)
      .fill(color)
      .stroke(OUTLINE);
    this.bubbleText.text = mood === 'stockout' ? '✕' : '…';
  }
}
