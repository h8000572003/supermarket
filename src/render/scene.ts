import { Application, Container, Graphics } from 'pixi.js';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Walker } from '../sim/agents/walker';
import type { Game } from '../sim/game';
import type { Weather } from '../sim/weather/weather';
import { accessTiles, footprint, footprintTiles } from '../sim/store/geometry';
import type { Placement } from '../sim/store/geometry';
import { BACKROOM_DOOR, ENTRANCE, STORE_DEPTH, STORE_WIDTH, isInsideStore } from '../sim/store/layout';
import type { GridPoint } from '../sim/store/layout';
import type { Controller } from '../ui/controller';
import { PersonSprite, STAFF_LOOK, customerLook, loadAgentTextures } from './agent-sprites';
import type { PersonLook } from './agent-sprites';
import { createFixtureSprites, loadFixtureTextures } from './fixture-sprites';
import { createStockItems, dispatchTiles, drawBadges, loadProductTextures } from './stock-visuals';
import type { FixtureStyle } from './fixture-sprites';
import { TILE_HEIGHT, TILE_WIDTH, gridToScreen, screenToGrid, tileDiamond } from './iso';
import type { ScreenPoint } from './iso';
import { Camera } from './camera';
import type { StoreBounds, Viewport } from './camera';
import { GestureTracker } from './gestures';
import { pickFixture } from './pick';
import { LANDSCAPE_PHONE_QUERY, NARROW_QUERY, matches } from '../ui/media';

const COLORS = {
  background: 0x2b2f3a,
  floorA: 0xe9e4d8,
  floorB: 0xdcd5c6,
  grid: 0xc4bba8,
  wallLeft: 0x9aa9b8,
  wallRight: 0xb7c4d1,
  wallTop: 0x6f7f90,
  entrance: 0x5fb37a,
  hover: 0xffffff,
  access: 0x4f9de0,
  selected: 0xffd86b,
  door: 0x7a5a3c,
  dispatch: 0xff9a3c,
};

/** 依今天天氣蓋在店面上的淡色調（雨偏藍灰、熱偏暖黃、冷偏冷藍）；晴天不加 */
const WEATHER_TINT: Readonly<Record<Weather, { color: number; alpha: number } | null>> = {
  sunny: null,
  rainy: { color: 0x4a5d7a, alpha: 0.16 },
  hot: { color: 0xffb830, alpha: 0.13 },
  cold: { color: 0x6fb4ff, alpha: 0.15 },
};

/** 派工標記在設施上方浮起的高度 */

const WALL_HEIGHT = TILE_HEIGHT * 2.5;
const DOOR_HEIGHT = TILE_HEIGHT * 1.6;

/** 店面（含牆）在場景座標中的範圍：左右是地板菱形的寬，上緣是牆頂、下緣是地板最前角 */
const STORE_BOUNDS: StoreBounds = {
  width: ((STORE_WIDTH + STORE_DEPTH) * TILE_WIDTH) / 2,
  height: ((STORE_WIDTH + STORE_DEPTH) * TILE_HEIGHT) / 2 + WALL_HEIGHT,
  center: {
    x: gridToScreen(STORE_WIDTH / 2, STORE_DEPTH / 2).x,
    y: (gridToScreen(STORE_WIDTH, STORE_DEPTH).y - WALL_HEIGHT) / 2,
  },
};

/** 依版面預留 HUD 與工具列的位置；與 styles.css 的版面對應 */
function viewportOf(app: Application): Viewport {
  const { width, height } = app.screen;
  const reserve = matches(LANDSCAPE_PHONE_QUERY)
    ? { top: 56, right: 164, bottom: 8, left: 8 }
    : matches(NARROW_QUERY)
      ? { top: 64, right: 0, bottom: 150, left: 0 }
      : { top: 72, right: 0, bottom: 140, left: 0 };
  return { width, height, reserve };
}

export interface StoreScene {
  destroy(): void;
  /** 鏡頭是否在預設位置（沒有縮放或平移過） */
  readonly viewIsDefault: boolean;
  /** 鏡頭每次改變就遞增；供介面元件跟著重新定位 */
  readonly viewVersion: number;
  resetView(): void;
  /** 平移鏡頭，讓設施落在畫面的指定區域（client 座標）內 */
  revealFixture(id: string, area: { top: number; bottom: number; left: number; right: number }): void;
  /** 網格座標（可帶小數）→ 視窗 client 座標 */
  gridToClient(p: { x: number; y: number }): ScreenPoint;
  /** 鏡頭移動或縮放時通知 */
  subscribeView(listener: () => void): () => void;
}

/** 建立等角店面場景並掛到 host 元素上；只讀取 game 狀態，輸入交給 controller */
export async function createStoreScene(host: HTMLElement, controller: Controller): Promise<StoreScene> {
  const { game, interaction } = controller;
  const app = new Application();
  await Promise.all([
    app.init({
      resizeTo: host,
      background: COLORS.background,
      antialias: true,
      // 手機螢幕的像素密度高，用實際解析度畫才不會糊；上限 2 以免太耗效能
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    }),
    loadFixtureTextures(),
    loadAgentTextures(),
    loadProductTextures(),
  ]);
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const overlay = new Graphics();
  const objects = new Container({ sortableChildren: true });
  const badges = new Graphics();
  const markers = new Graphics();
  // 天氣色調蓋在牆、地板、設施與人物上；派工標記與庫存徽章在它之上，維持清楚
  const weatherTint = new Graphics();
  weatherTint.eventMode = 'none';
  world.addChild(drawWalls(), drawFloor(), drawEntrance(), overlay, objects, weatherTint, markers, badges);
  let tintedWeather: Weather | null = null;

  const camera = new Camera(viewportOf(app), STORE_BOUNDS);
  const viewListeners = new Set<() => void>();
  let viewVersion = 0;
  const applyCamera = () => {
    viewVersion++;
    world.scale.set(camera.scale);
    const pos = camera.position;
    world.position.set(pos.x, pos.y);
    for (const listener of viewListeners) listener();
  };
  applyCamera();
  const onResize = () => {
    camera.setViewport(viewportOf(app));
    applyCamera();
  };
  app.renderer.on('resize', onResize);

  const cellAt = (screen: ScreenPoint): GridPoint | null => {
    const local = camera.toWorld(screen);
    const cell = screenToGrid(local.x, local.y);
    return isInsideStore(cell) ? cell : null;
  };

  const gestures = new GestureTracker({
    hover: (p) => controller.hover(p ? cellAt(p) : null),
    secondary: () => controller.cancel(),
    pan: (dx, dy) => {
      camera.panBy(dx, dy);
      applyCamera();
    },
    pinch: (center, factor) => {
      camera.zoomAt(center, factor);
      applyCamera();
    },
    tap: (p, pointerType) => {
      const { tool } = interaction.state;
      const cell = cellAt(p);
      if (tool.mode === 'select') {
        // 點到設施的圖本身（不只是底下的地板格）就選取它
        const picked = pickFixture(game.fixtures, camera.toWorld(p));
        controller.select(picked?.id ?? (cell ? game.fixtureAt(cell)?.id : undefined) ?? null);
        // 觸控沒有 hover：不留下最後點過的白框
        controller.hover(pointerType === 'mouse' ? cell : null);
        return;
      }
      controller.hover(cell);
      if (cell) controller.click(cell);
    },
  });

  const canvas = app.canvas;
  const sample = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button, pointerType: e.pointerType };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0) canvas.setPointerCapture(e.pointerId);
    gestures.down(sample(e));
  };
  const onPointerMove = (e: PointerEvent) => gestures.move(sample(e));
  const onPointerUp = (e: PointerEvent) => gestures.up(sample(e));
  const onPointerCancel = (e: PointerEvent) => gestures.cancel(sample(e));
  const onPointerLeave = (e: PointerEvent) => gestures.leave(e);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    applyCamera();
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const listeners: [string, EventListener, AddEventListenerOptions?][] = [
    ['pointerdown', onPointerDown as EventListener],
    ['pointermove', onPointerMove as EventListener],
    ['pointerup', onPointerUp as EventListener],
    ['pointercancel', onPointerCancel as EventListener],
    ['pointerleave', onPointerLeave as EventListener],
    ['wheel', onWheel as EventListener, { passive: false }],
    ['contextmenu', onContextMenu as EventListener],
  ];
  for (const [type, fn, opts] of listeners) canvas.addEventListener(type, fn, opts);

  const redraw = () => {
    if (game.today.weather !== tintedWeather) {
      tintedWeather = game.today.weather;
      drawWeatherTint(weatherTint, tintedWeather);
    }
    drawObjects(objects, game, controller);
    drawOverlay(overlay, game, controller);
    drawDispatchMarkers(markers, game);
    drawBadges(badges, game);
  };
  redraw();
  const unsubscribeGame = game.subscribe(redraw);
  const unsubscribeInteraction = interaction.subscribe(redraw);

  // 人物位置每幀更新：在模擬的上一步與這一步之間內插
  const agentSprites = new Map<string, PersonSprite>();
  app.ticker.add(() => {
    const alive = new Set<string>();
    const alpha = game.stepAlpha;
    const sync = (agent: Walker, look: () => PersonLook): PersonSprite => {
      alive.add(agent.id);
      let sprite = agentSprites.get(agent.id);
      if (!sprite) {
        sprite = new PersonSprite(look());
        agentSprites.set(agent.id, sprite);
        objects.addChild(sprite);
      }
      const x = agent.prev.x + (agent.pos.x - agent.prev.x) * alpha;
      const y = agent.prev.y + (agent.pos.y - agent.prev.y) * alpha;
      const p = gridToScreen(x + 0.5, y + 0.5);
      sprite.position.set(p.x, p.y);
      sprite.faceToward(p.x);
      sprite.zIndex = (x + y) * 10 + 5;
      return sprite;
    };
    for (const staff of game.staffAgents) {
      sync(staff, () => STAFF_LOOK).carrying = staff.carrying.length > 0;
    }
    for (const customer of game.customerAgents) {
      const sprite = sync(customer, () => customerLook(customer.id));
      sprite.holdingBasket = customer.basket.length > 0 && !customer.outcome;
      sprite.setMood(customer.mood);
    }
    for (const [id, sprite] of agentSprites) {
      if (alive.has(id)) continue;
      sprite.destroy({ children: true });
      agentSprites.delete(id);
    }
  });

  return {
    destroy() {
      unsubscribeGame();
      unsubscribeInteraction();
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
      viewListeners.clear();
      app.destroy(true, { children: true });
    },
    get viewIsDefault() {
      return camera.isDefault;
    },
    get viewVersion() {
      return viewVersion;
    },
    resetView() {
      camera.reset();
      camera.setViewport(viewportOf(app));
      applyCamera();
    },
    revealFixture(id, area) {
      const f = game.fixture(id);
      if (!f) return;
      const fp = footprint(FIXTURES[f.kind], f);
      // 以地板最前角為準：這一點露出來，整個設施圖就都在抽屜外
      const front = gridToScreen(fp.origin.x + fp.spanX, fp.origin.y + fp.spanY);
      camera.reveal(front, area);
      applyCamera();
    },
    gridToClient(p) {
      const rect = canvas.getBoundingClientRect();
      const s = camera.toScreen(gridToScreen(p.x, p.y));
      return { x: rect.left + s.x, y: rect.top + s.y };
    },
    subscribeView(listener) {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
  };
}

const FIXTURE_LABEL = 'fixture';

function drawObjects(objects: Container, game: Game, { interaction }: Controller): void {
  for (const child of objects.children.filter((c) => c.label === FIXTURE_LABEL)) {
    objects.removeChild(child);
    child.destroy({ children: true });
  }
  const { tool, hover } = interaction.state;
  const movingId = tool.mode === 'place' ? tool.movingId : undefined;

  const add = (kind: FixtureKind, placement: Placement, style: FixtureStyle, depthBias = 0) => {
    for (const sprite of createFixtureSprites(kind, placement, style)) {
      sprite.label = FIXTURE_LABEL;
      sprite.zIndex += depthBias;
      objects.addChild(sprite);
    }
  };

  for (const f of game.fixtures) {
    add(f.kind, f, f.id === movingId ? 'moving-origin' : 'normal');
    if (f.id === movingId) continue;
    // 架上的商品緊接在那一格家具圖之後畫，人物仍可擋在前面
    for (const tile of footprintTiles(footprint(FIXTURES[f.kind], f))) {
      const items = createStockItems(game, f, tile);
      if (!items) continue;
      items.label = FIXTURE_LABEL;
      items.zIndex = (tile.x + tile.y) * 10 + 1;
      objects.addChild(items);
    }
  }

  if (tool.mode === 'place' && hover) {
    const placement = { origin: hover, facing: tool.facing };
    const error = game.checkPlacement(tool.kind, placement, tool.movingId);
    add(tool.kind, placement, error ? 'ghost-bad' : 'ghost-ok', 5);
  }
}

/** 地板上的提示：滑鼠所在格、預覽或選取設施的取用格 */
function drawOverlay(g: Graphics, game: Game, { interaction }: Controller): void {
  g.clear();
  const { tool, selectedId, hover } = interaction.state;
  const markAccess = (kind: FixtureKind, placement: Placement) => {
    for (const t of accessTiles(FIXTURES[kind], placement)) {
      if (!isInsideStore(t)) continue;
      g.poly(tileDiamond(t.x, t.y)).fill({ color: COLORS.access, alpha: 0.35 });
    }
  };

  if (tool.mode === 'place' && hover) {
    markAccess(tool.kind, { origin: hover, facing: tool.facing });
  } else if (selectedId) {
    const f = game.fixture(selectedId);
    if (f) {
      markAccess(f.kind, f);
      for (const t of footprintTiles(footprint(FIXTURES[f.kind], f))) {
        g.poly(tileDiamond(t.x, t.y)).fill({ color: COLORS.selected, alpha: 0.45 }).stroke({ width: 2, color: COLORS.selected });
      }
    }
  }
  if (hover && tool.mode === 'select') {
    g.poly(tileDiamond(hover.x, hover.y)).fill({ color: COLORS.hover, alpha: 0.3 }).stroke({ width: 2, color: COLORS.hover });
  }
}

/** 派工標記：地板上標出店員要站的格子與那一格設施（設施上方的「!」由 drawBadges 畫） */
function drawDispatchMarkers(g: Graphics, game: Game): void {
  g.clear();
  for (const d of game.dispatches) {
    const f = game.fixture(d.kind === 'slot' ? d.fixtureId : d.registerId);
    const at = f && dispatchTiles(f, d);
    if (!at) continue;
    g.poly(tileDiamond(at.stand.x, at.stand.y)).fill({ color: COLORS.dispatch, alpha: 0.35 }).stroke({ width: 2, color: COLORS.dispatch });
    g.poly(tileDiamond(at.tile.x, at.tile.y)).stroke({ width: 3, color: COLORS.dispatch });
  }
}

function drawFloor(): Graphics {
  const g = new Graphics();
  for (let x = 0; x < STORE_WIDTH; x++) {
    for (let y = 0; y < STORE_DEPTH; y++) {
      g.poly(tileDiamond(x, y))
        .fill((x + y) % 2 === 0 ? COLORS.floorA : COLORS.floorB)
        .stroke({ width: 1, color: COLORS.grid, alpha: 0.6 });
    }
  }
  return g;
}

/** 後方兩面牆：沿 y = 0（右後）與 x = 0（左後）的邊 */
/** 店面（牆與地板）的外框多邊形，填上今天天氣的色調 */
function drawWeatherTint(g: Graphics, weather: Weather): void {
  g.clear();
  const tint = WEATHER_TINT[weather];
  if (!tint) return;
  const origin = gridToScreen(0, 0);
  const backRight = gridToScreen(STORE_WIDTH, 0);
  const front = gridToScreen(STORE_WIDTH, STORE_DEPTH);
  const backLeft = gridToScreen(0, STORE_DEPTH);
  g.poly([
    backLeft.x,
    backLeft.y - WALL_HEIGHT,
    origin.x,
    origin.y - WALL_HEIGHT,
    backRight.x,
    backRight.y - WALL_HEIGHT,
    backRight.x,
    backRight.y,
    front.x,
    front.y,
    backLeft.x,
    backLeft.y,
  ]).fill(tint);
}

function drawWalls(): Graphics {
  const g = new Graphics();
  const origin = gridToScreen(0, 0);
  const backRight = gridToScreen(STORE_WIDTH, 0);
  const backLeft = gridToScreen(0, STORE_DEPTH);
  const up = (p: { x: number; y: number }) => [p.x, p.y - WALL_HEIGHT];

  g.poly([origin.x, origin.y, backRight.x, backRight.y, ...up(backRight), ...up(origin)]).fill(COLORS.wallRight);
  g.poly([origin.x, origin.y, backLeft.x, backLeft.y, ...up(backLeft), ...up(origin)]).fill(COLORS.wallLeft);
  g.moveTo(...(up(backLeft) as [number, number]))
    .lineTo(...(up(origin) as [number, number]))
    .lineTo(...(up(backRight) as [number, number]))
    .stroke({ width: 3, color: COLORS.wallTop });

  // 倉庫門：左後牆上對應 BACKROOM_DOOR 那一格
  const doorA = gridToScreen(0, BACKROOM_DOOR.y + 0.15);
  const doorB = gridToScreen(0, BACKROOM_DOOR.y + 0.85);
  g.poly([doorA.x, doorA.y, doorB.x, doorB.y, doorB.x, doorB.y - DOOR_HEIGHT, doorA.x, doorA.y - DOOR_HEIGHT]).fill(COLORS.door);
  g.circle(doorB.x + 4, doorB.y - DOOR_HEIGHT / 2 - 2, 1.8).fill(COLORS.wallTop);
  return g;
}

/** 入口：底邊的地墊與外側箭頭 */
function drawEntrance(): Graphics {
  const g = new Graphics();
  g.poly(tileDiamond(ENTRANCE.x, ENTRANCE.y)).fill({ color: COLORS.entrance, alpha: 0.85 });
  const outside = gridToScreen(ENTRANCE.x + 0.5, ENTRANCE.y + 1.6);
  const inside = gridToScreen(ENTRANCE.x + 0.5, ENTRANCE.y + 1.05);
  g.moveTo(outside.x, outside.y).lineTo(inside.x, inside.y).stroke({ width: 3, color: COLORS.entrance });
  return g;
}
