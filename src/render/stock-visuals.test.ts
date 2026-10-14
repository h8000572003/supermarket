import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import { footprint, footprintTiles, slotAccessTile } from '../sim/store/geometry';
import type { Facing } from '../sim/store/geometry';
import type { Fixture } from '../sim/store/store-layout';
import { TILE_WIDTH, gridToScreen } from './iso';
import { dispatchTiles, itemsOnLevel, layoutBadges, slotLevel } from './stock-visuals';
import type { ScreenBox } from './stock-visuals';

describe('陳列庫存的畫面', () => {
  it('依陳列庫存判斷格位空、偏低（低於補貨門檻）、有貨、滿', () => {
    expect(slotLevel(0, 12)).toBe('empty');
    expect(slotLevel(3, 12)).toBe('low');
    expect(slotLevel(6, 12)).toBe('ok');
    expect(slotLevel(12, 12)).toBe('full');
  });

  it('空的不畫商品，偏低、有貨、滿依序畫越多件', () => {
    expect(itemsOnLevel('empty')).toBe(0);
    expect(itemsOnLevel('low')).toBeGreaterThan(0);
    expect(itemsOnLevel('ok')).toBeGreaterThan(itemsOnLevel('low'));
    expect(itemsOnLevel('full')).toBeGreaterThan(itemsOnLevel('ok'));
  });
});

describe('設施上方提示的位置', () => {
  const FACINGS: readonly Facing[] = ['north', 'south', 'east', 'west'];
  const overlaps = (a: ScreenBox, b: ScreenBox) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  /** 各種提示組合（膠囊兩個點） */
  const combos = [false, true].flatMap((capsule) =>
    [false, true].flatMap((dispatch) => [false, true].map((changeover) => ({ capsule, dispatch, changeover }))),
  );
  const badgesFor = (kind: FixtureKind, tile: { x: number; y: number }, c: (typeof combos)[number]) =>
    layoutBadges({ kind, tile, capsule: c.capsule ? (['empty', 'ok'] as const) : null, dispatch: c.dispatch, changeover: c.changeover });

  for (const kind of ['shelf', 'fridge', 'register'] as const) {
    it(`${kind}：同一格的提示由下往上依序為膠囊、「!」、⇄，互不重疊，且不超出一格的寬度`, () => {
      const tile = { x: 4, y: 4 };
      const center = gridToScreen(tile.x + 0.5, tile.y + 0.5);
      for (const c of combos) {
        const placed = badgesFor(kind, tile, c);
        expect(placed.map((b) => b.kind)).toEqual(
          (['capsule', 'dispatch', 'changeover'] as const).filter((k) => c[k]),
        );
        for (let i = 1; i < placed.length; i++) {
          expect(placed[i]!.y).toBeLessThan(placed[i - 1]!.y);
          for (let j = 0; j < i; j++) expect(overlaps(placed[i]!.box, placed[j]!.box)).toBe(false);
        }
        for (const b of placed) {
          expect(b.box.right - b.box.left).toBeLessThan(TILE_WIDTH);
          // 浮在設施上方：底部高於頂面中心
          expect(b.box.bottom).toBeLessThan(center.y);
        }
      }
    });
  }

  for (const kind of ['shelf', 'fridge'] as const) {
    for (const facing of FACINGS) {
      it(`${kind} 朝 ${facing}：同一個陳列櫃相鄰兩格的提示不會互相重疊`, () => {
        const f: Fixture = { id: 'f1', kind, facing, origin: { x: 4, y: 4 } };
        const [a, b] = footprintTiles(footprint(FIXTURES[kind], f));
        const full = { capsule: true, dispatch: true, changeover: true };
        for (const pa of badgesFor(kind, a!, full)) {
          for (const pb of badgesFor(kind, b!, full)) expect(overlaps(pa.box, pb.box)).toBe(false);
        }
      });
    }
  }

  it('派工的「!」標在與店員站立格相鄰的那一格設施上', () => {
    for (const facing of FACINGS) {
      const f: Fixture = { id: 'f1', kind: 'shelf', facing, origin: { x: 4, y: 4 } };
      for (let slotIndex = 0; slotIndex < FIXTURES.shelf.slots; slotIndex++) {
        const at = dispatchTiles(f, { kind: 'slot', fixtureId: 'f1', slotIndex })!;
        expect(at.stand).toEqual(slotAccessTile(FIXTURES.shelf, f, slotIndex));
        expect(Math.abs(at.stand.x - at.tile.x) + Math.abs(at.stand.y - at.tile.y)).toBe(1);
      }
    }
  });
});
