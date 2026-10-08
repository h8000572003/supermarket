import { Application, Container, Graphics } from 'pixi.js';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Walker } from '../sim/agents/walker';
import type { Game } from '../sim/game';
import { accessTiles, footprint, footprintTiles } from '../sim/store/geometry';
import type { Placement } from '../sim/store/geometry';
import { BACKROOM_DOOR, ENTRANCE, STORE_DEPTH, STORE_WIDTH, isInsideStore } from '../sim/store/layout';
import type { GridPoint } from '../sim/store/layout';
import type { Controller } from '../ui/controller';
import { PersonSprite, STAFF_LOOK, customerLook, loadAgentTextures } from './agent-sprites';
import type { PersonLook } from './agent-sprites';
import { createFixtureSprites, loadFixtureTextures } from './fixture-sprites';
import type { FixtureStyle } from './fixture-sprites';
import { TILE_HEIGHT, TILE_WIDTH, gridToScreen, screenToGrid, tileDiamond } from './iso';

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
};

const WALL_HEIGHT = TILE_HEIGHT * 2.5;
const DOOR_HEIGHT = TILE_HEIGHT * 1.6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

export interface StoreScene {
  destroy(): void;
}

/** 建立等角店面場景並掛到 host 元素上；只讀取 game 狀態，輸入交給 controller */
export async function createStoreScene(host: HTMLElement, controller: Controller): Promise<StoreScene> {
  const { game, interaction } = controller;
  const app = new Application();
  await Promise.all([
    app.init({ resizeTo: host, background: COLORS.background, antialias: true }),
    loadFixtureTextures(),
    loadAgentTextures(),
  ]);
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const overlay = new Graphics();
  const objects = new Container({ sortableChildren: true });
  world.addChild(drawWalls(), drawFloor(), drawEntrance(), overlay, objects);

  // 實際縮放 = 依畫面大小自動貼合的基準 × 玩家以滾輪調整的倍率
  let userZoom = 1;
  const layout = () => {
    const zoom = fitZoom(app.screen.width, app.screen.height) * userZoom;
    // 店面中心置於畫面中央
    const center = gridToScreen(STORE_WIDTH / 2, STORE_DEPTH / 2);
    world.scale.set(zoom);
    world.position.set(app.screen.width / 2 - center.x * zoom, app.screen.height / 2 - center.y * zoom);
  };
  layout();
  app.renderer.on('resize', layout);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    userZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, userZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    layout();
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  app.canvas.addEventListener('wheel', onWheel, { passive: false });
  app.canvas.addEventListener('contextmenu', onContextMenu);

  const cellAt = (global: { x: number; y: number }): GridPoint | null => {
    const local = world.toLocal(global);
    const cell = screenToGrid(local.x, local.y);
    return isInsideStore(cell) ? cell : null;
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointermove', (e) => controller.hover(cellAt(e.global)));
  app.stage.on('pointerleave', () => controller.hover(null));
  app.stage.on('pointerdown', (e) => {
    if (e.button === 2) return controller.cancel();
    if (e.button !== 0) return;
    const cell = cellAt(e.global);
    controller.hover(cell);
    if (cell) controller.click(cell);
  });

  const redraw = () => {
    drawObjects(objects, game, controller);
    drawOverlay(overlay, game, controller);
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
      app.canvas.removeEventListener('wheel', onWheel);
      app.canvas.removeEventListener('contextmenu', onContextMenu);
      app.destroy(true, { children: true });
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

/** 讓整個店面（含牆）放得進畫面、最大不超過 1 的縮放 */
function fitZoom(width: number, height: number): number {
  const storeWidth = ((STORE_WIDTH + STORE_DEPTH) * TILE_WIDTH) / 2;
  const storeHeight = ((STORE_WIDTH + STORE_DEPTH) * TILE_HEIGHT) / 2 + WALL_HEIGHT;
  // 預留 HUD 與工具列的空間
  return Math.min(1, (width - 32) / storeWidth, (height - 200) / storeHeight);
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
