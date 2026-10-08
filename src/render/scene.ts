import { Application, Container, Graphics } from 'pixi.js';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Game } from '../sim/game';
import { accessTiles, footprint, footprintTiles } from '../sim/store/geometry';
import type { Placement } from '../sim/store/geometry';
import { ENTRANCE, STORE_DEPTH, STORE_WIDTH, isInsideStore } from '../sim/store/layout';
import type { GridPoint } from '../sim/store/layout';
import type { Controller } from '../ui/controller';
import { createFixtureSprites, loadFixtureTextures } from './fixture-sprites';
import type { FixtureStyle } from './fixture-sprites';
import { TILE_HEIGHT, gridToScreen, screenToGrid, tileDiamond } from './iso';

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
};

const WALL_HEIGHT = TILE_HEIGHT * 2.5;
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
  ]);
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const overlay = new Graphics();
  const objects = new Container({ sortableChildren: true });
  world.addChild(drawWalls(), drawFloor(), drawEntrance(), overlay, objects);

  let zoom = 1;
  const layout = () => {
    // 店面中心置於畫面中央
    const center = gridToScreen(STORE_WIDTH / 2, STORE_DEPTH / 2);
    world.scale.set(zoom);
    world.position.set(app.screen.width / 2 - center.x * zoom, app.screen.height / 2 - center.y * zoom);
  };
  layout();
  app.renderer.on('resize', layout);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
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

function drawObjects(objects: Container, game: Game, { interaction }: Controller): void {
  for (const child of objects.removeChildren()) child.destroy({ children: true });
  const { tool, hover } = interaction.state;
  const movingId = tool.mode === 'place' ? tool.movingId : undefined;

  const add = (kind: FixtureKind, placement: Placement, style: FixtureStyle, depthBias = 0) => {
    for (const sprite of createFixtureSprites(kind, placement, style)) {
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
