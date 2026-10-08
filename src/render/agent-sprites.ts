import { Assets, Container, Graphics, Sprite } from 'pixi.js';
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

/** 佔位的等角小人：原點在腳底中心；carrying 子物件為頭上的紙箱 */
export class PersonSprite extends Container {
  private readonly box: Sprite;

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
  }

  set carrying(value: boolean) {
    this.box.visible = value;
  }
}
