import { FIXTURES } from '../catalog/fixtures';
import type { FixtureKind } from '../catalog/fixtures';
import { isReachable, reachableFrom } from '../pathfinding/grid';
import { accessTiles, footprint, footprintTiles, inFootprint } from './geometry';
import type { Placement } from './geometry';
import { BACKROOM_DOOR, ENTRANCE, isInsideStore } from './layout';
import type { GridPoint } from './layout';

export interface Fixture extends Placement {
  readonly id: string;
  readonly kind: FixtureKind;
}

export type PlacementError =
  /** 設施超出店面 */
  | 'out-of-bounds'
  /** 與其他設施重疊 */
  | 'overlaps-fixture'
  /** 擋住入口 */
  | 'blocks-entrance'
  /** 擋住倉庫門 */
  | 'blocks-backroom-door'
  /** 自己的取用格在店外或被其他設施佔用 */
  | 'access-blocked'
  /** 壓住其他設施的取用格 */
  | 'covers-access'
  /** 有取用格無法從入口走到 */
  | 'unreachable';

const samePoint = (a: GridPoint, b: GridPoint) => a.x === b.x && a.y === b.y;

/** 店內設施的擺放狀態與擺放規則 */
export class StoreLayout {
  private readonly fixtures = new Map<string, Fixture>();

  list(): Fixture[] {
    return [...this.fixtures.values()];
  }

  get(id: string): Fixture | undefined {
    return this.fixtures.get(id);
  }

  fixtureAt(p: GridPoint): Fixture | undefined {
    return this.list().find((f) => inFootprint(footprint(FIXTURES[f.kind], f), p));
  }

  /** 顧客與店員可走的格子 */
  isWalkable(p: GridPoint): boolean {
    return isInsideStore(p) && !this.fixtureAt(p);
  }

  /** 檢查擺放是否合法；ignoreId 為正在移動的設施本身 */
  validate(kind: FixtureKind, placement: Placement, ignoreId?: string): PlacementError | null {
    const def = FIXTURES[kind];
    const fp = footprint(def, placement);
    const tiles = footprintTiles(fp);
    const others = this.list().filter((f) => f.id !== ignoreId);
    const occupiedByOthers = (p: GridPoint) => others.some((f) => inFootprint(footprint(FIXTURES[f.kind], f), p));

    if (!tiles.every(isInsideStore)) return 'out-of-bounds';
    if (tiles.some(occupiedByOthers)) return 'overlaps-fixture';
    if (tiles.some((t) => samePoint(t, ENTRANCE))) return 'blocks-entrance';
    if (tiles.some((t) => samePoint(t, BACKROOM_DOOR))) return 'blocks-backroom-door';

    const ownAccess = accessTiles(def, placement);
    if (ownAccess.some((t) => !isInsideStore(t) || occupiedByOthers(t))) return 'access-blocked';

    const othersAccess = others.flatMap((f) => accessTiles(FIXTURES[f.kind], f));
    if (othersAccess.some((t) => inFootprint(fp, t))) return 'covers-access';

    const walkable = (p: GridPoint) => isInsideStore(p) && !inFootprint(fp, p) && !occupiedByOthers(p);
    const reachable = reachableFrom(ENTRANCE, walkable);
    if (![BACKROOM_DOOR, ...ownAccess, ...othersAccess].every((t) => isReachable(reachable, t))) return 'unreachable';

    return null;
  }

  /** 呼叫前須先通過 validate */
  put(fixture: Fixture): void {
    this.fixtures.set(fixture.id, fixture);
  }

  remove(id: string): void {
    this.fixtures.delete(id);
  }
}
