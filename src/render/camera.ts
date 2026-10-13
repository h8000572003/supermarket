import type { ScreenPoint } from './iso';

/** 店面四周要讓給 HUD、工具列的畫面空間（px） */
export interface Reserve {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly reserve: Reserve;
}

/** 店面（含牆）在場景座標中的寬高與中心 */
export interface StoreBounds {
  readonly width: number;
  readonly height: number;
  readonly center: ScreenPoint;
}

export const MIN_USER_ZOOM = 0.5;
export const MAX_USER_ZOOM = 3;
/** 拖曳時至少留在畫面內的店面寬度（px） */
const KEEP_VISIBLE = 80;

/** 讓整個店面放進可用區域的縮放；最大不超過 1.4，避免大螢幕上過度放大 */
export function fitZoom({ width, height, reserve }: Viewport, store: StoreBounds): number {
  const w = width - reserve.left - reserve.right - 16;
  const h = height - reserve.top - reserve.bottom - 16;
  return Math.max(0.1, Math.min(1.4, w / store.width, h / store.height));
}

/**
 * 鏡頭：基準縮放（貼齊可用區域）× 玩家縮放，加上平移。
 * 平移量是店面中心相對於可用區域中心的螢幕位移。
 */
export class Camera {
  userZoom = 1;
  pan: ScreenPoint = { x: 0, y: 0 };

  constructor(
    private viewport: Viewport,
    private readonly store: StoreBounds,
  ) {}

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    this.clamp();
  }

  get scale(): number {
    return fitZoom(this.viewport, this.store) * this.userZoom;
  }

  /** 可用區域的中心（螢幕座標） */
  private get anchor(): ScreenPoint {
    const { width, height, reserve } = this.viewport;
    return {
      x: reserve.left + (width - reserve.left - reserve.right) / 2,
      y: reserve.top + (height - reserve.top - reserve.bottom) / 2,
    };
  }

  /** 場景容器的位置：讓店面中心落在 anchor + pan */
  get position(): ScreenPoint {
    const s = this.scale;
    const a = this.anchor;
    return { x: a.x + this.pan.x - this.store.center.x * s, y: a.y + this.pan.y - this.store.center.y * s };
  }

  toScreen(p: ScreenPoint): ScreenPoint {
    const pos = this.position;
    const s = this.scale;
    return { x: pos.x + p.x * s, y: pos.y + p.y * s };
  }

  toWorld(p: ScreenPoint): ScreenPoint {
    const pos = this.position;
    const s = this.scale;
    return { x: (p.x - pos.x) / s, y: (p.y - pos.y) / s };
  }

  panBy(dx: number, dy: number): void {
    this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
    this.clamp();
  }

  /** 以螢幕上的某一點為中心縮放：該點下方的場景位置不動 */
  zoomAt(screen: ScreenPoint, factor: number): void {
    const world = this.toWorld(screen);
    this.userZoom = Math.min(MAX_USER_ZOOM, Math.max(MIN_USER_ZOOM, this.userZoom * factor));
    const after = this.toScreen(world);
    this.panBy(screen.x - after.x, screen.y - after.y);
  }

  reset(): void {
    this.userZoom = 1;
    this.pan = { x: 0, y: 0 };
  }

  get isDefault(): boolean {
    return this.userZoom === 1 && this.pan.x === 0 && this.pan.y === 0;
  }

  /** 平移讓場景中的某一點落在螢幕的指定區域內；已經在區域內就不動 */
  reveal(p: ScreenPoint, area: { top: number; bottom: number; left: number; right: number }): void {
    const at = this.toScreen(p);
    const dx = at.x < area.left ? area.left - at.x : at.x > area.right ? area.right - at.x : 0;
    const dy = at.y < area.top ? area.top - at.y : at.y > area.bottom ? area.bottom - at.y : 0;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this.panBy(dx, dy);
  }

  /** 店面至少留 KEEP_VISIBLE px 在畫面內，不能被拖到看不見 */
  private clamp(): void {
    this.pan = clampPan(this.pan, this.viewport, this.store, this.scale);
  }
}

export function clampPan(pan: ScreenPoint, viewport: Viewport, store: StoreBounds, scale: number): ScreenPoint {
  const limitX = Math.max(0, viewport.width / 2 + (store.width * scale) / 2 - KEEP_VISIBLE);
  const limitY = Math.max(0, viewport.height / 2 + (store.height * scale) / 2 - KEEP_VISIBLE);
  return {
    x: Math.min(limitX, Math.max(-limitX, pan.x)),
    y: Math.min(limitY, Math.max(-limitY, pan.y)),
  };
}
