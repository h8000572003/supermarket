import { Container, Graphics, Text } from 'pixi.js';
import type { NuisanceKind } from '../sim/nuisances/nuisances';
import { NUISANCE_ICON_HEIGHT } from './pick';

/**
 * 麻煩的外觀：以程式繪製，風格與人物、商品一致（深色描邊、平塗）。
 * 原點在所在格的中心（地板上）；頭上有醒目圖示，已派店員處理時改成「處理中」樣式。
 */

const OUTLINE = { width: 1.2, color: 0x3b2f2a, alpha: 0.95 };
const ALERT_COLOR = 0xe53935;
const HANDLING_COLOR = 0x1e88e5;

function drawLitter(g: Graphics): void {
  // 揉皺的紙團與一個扁掉的飲料罐
  g.ellipse(0, 1.5, 9, 3.5).fill({ color: 0x000000, alpha: 0.18 });
  g.poly([-7, -1, -4, -5, 0, -4, 1, -1, -2, 2, -6, 2]).fill(0xf5f5f5).stroke(OUTLINE);
  g.moveTo(-5, -2).lineTo(-2, -3).lineTo(-1, -1).stroke({ width: 0.8, color: 0x9e9e9e });
  g.roundRect(2, -3, 7, 4, 1.5).fill(0xef5350).stroke(OUTLINE);
  g.rect(3.5, -2.2, 3, 2.4).fill(0xffffff);
}

export class NuisanceSprite extends Container {
  private readonly icon = new Container();
  private readonly iconBg = new Graphics();
  private readonly iconText: Text;
  private handling: boolean | null = null;
  private lastX: number | null = null;
  private readonly figure = new Container();

  constructor(readonly kind: NuisanceKind) {
    super();
    const body = new Graphics();
    drawLitter(body);
    body.scale.set(1.4);
    this.figure.addChild(body);
    this.addChild(this.figure);

    this.iconText = new Text({ text: '', style: { fontSize: 11, fontWeight: '700', fill: 0xffffff } });
    this.iconText.anchor.set(0.5);
    this.icon.addChild(this.iconBg, this.iconText);
    this.icon.position.set(0, -NUISANCE_ICON_HEIGHT[kind]);
    this.addChild(this.icon);
    this.setHandling(false);
  }

  /** 依畫面上的水平移動方向翻面（圖示不翻） */
  faceToward(x: number): void {
    if (this.lastX !== null && Math.abs(x - this.lastX) > 0.05) {
      this.figure.scale.x = x < this.lastX ? -1 : 1;
    }
    this.lastX = x;
  }

  /** 已派店員處理（處理中）或還在等待處理（醒目的「!」） */
  setHandling(handling: boolean): void {
    if (handling === this.handling) return;
    this.handling = handling;
    const color = handling ? HANDLING_COLOR : ALERT_COLOR;
    this.iconBg.clear().circle(0, 0, 8.5).fill(color).stroke(OUTLINE);
    this.iconText.text = handling ? '…' : '!';
  }

  /** 讓等待處理的圖示上下跳動，比較醒目；t 為毫秒 */
  animate(t: number): void {
    this.icon.y = -NUISANCE_ICON_HEIGHT[this.kind] - (this.handling ? 0 : Math.abs(Math.sin(t / 180)) * 3);
  }
}
