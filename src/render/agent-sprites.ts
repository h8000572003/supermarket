import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Texture } from 'pixi.js';

const BOX_URL = `${import.meta.env.BASE_URL}assets/kenney-furniture/cardboardBoxClosed_SW.png`;

export async function loadAgentTextures(): Promise<void> {
  await Assets.load(BOX_URL);
}

export interface PersonLook {
  readonly body: number;
  readonly hair: number;
}

export const STAFF_LOOK: PersonLook = { body: 0x2f7fd1, hair: 0x3b2a20 };

const CUSTOMER_BODIES = [0xd9534f, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xc0c4cc, 0xe84393];
const CUSTOMER_HAIRS = [0x2b1d14, 0x5a3a22, 0x8a6a3a, 0x1d1d1d, 0xb0b0b0];

/** 依顧客 id 決定固定的外觀 */
export function customerLook(id: string): PersonLook {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    body: CUSTOMER_BODIES[h % CUSTOMER_BODIES.length] as number,
    hair: CUSTOMER_HAIRS[(h >>> 8) % CUSTOMER_HAIRS.length] as number,
  };
}

export type Mood = 'stockout' | 'impatient' | null;

/** 佔位的等角小人：原點在腳底中心；可顯示頭上的紙箱、手上的購物籃與心情泡泡 */
export class PersonSprite extends Container {
  private readonly box: Sprite;
  private readonly basket: Graphics;
  private readonly bubble: Container;
  private readonly bubbleText: Text;
  private readonly bubbleBg: Graphics;
  private mood: Mood = null;

  constructor(look: PersonLook) {
    super();
    const g = new Graphics();
    g.ellipse(0, 0, 9, 4.5).fill({ color: 0x000000, alpha: 0.22 });
    g.roundRect(-6, -24, 12, 20, 5).fill(look.body);
    g.rect(-4, -6, 3, 6).fill(0x3a3f4b);
    g.rect(1, -6, 3, 6).fill(0x3a3f4b);
    g.circle(0, -29, 6).fill(0xf3cfa3);
    g.arc(0, -30, 6.2, Math.PI, 0).fill(look.hair);
    this.addChild(g);

    this.box = new Sprite(Assets.get<Texture>(BOX_URL));
    this.box.anchor.set(0.5, 1);
    this.box.scale.set(18 / this.box.texture.width);
    this.box.position.set(0, -34);
    this.box.visible = false;
    this.addChild(this.box);

    this.basket = new Graphics();
    this.basket.roundRect(5, -14, 8, 6, 1.5).fill(0xf5d76e).stroke({ width: 1, color: 0x8a6d1f });
    this.basket.visible = false;
    this.addChild(this.basket);

    this.bubble = new Container();
    this.bubbleBg = new Graphics();
    this.bubbleText = new Text({ text: '', style: { fontSize: 11, fontWeight: '700', fill: 0xffffff } });
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.position.set(10, -44);
    this.bubble.visible = false;
    this.addChild(this.bubble);
  }

  set carrying(value: boolean) {
    this.box.visible = value;
  }

  set holdingBasket(value: boolean) {
    this.basket.visible = value;
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.bubble.visible = mood !== null;
    if (!mood) return;
    const color = mood === 'stockout' ? 0xd9534f : 0xf0ad4e;
    this.bubbleBg.clear().circle(0, 0, 8).fill(color).stroke({ width: 1.5, color: 0xffffff });
    this.bubbleText.text = mood === 'stockout' ? '✕' : '…';
  }
}
