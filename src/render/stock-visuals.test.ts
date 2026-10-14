import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../sim/catalog/fixtures';
import { footprint, footprintTiles, slotAccessTile } from '../sim/store/geometry';
import type { Facing } from '../sim/store/geometry';
import type { Fixture } from '../sim/store/store-layout';
import { gridToScreen } from './iso';
import { changeoverBadgeBox, changeoverMarkers, dispatchBadge, itemsOnLevel, slotLevel, stockAlertBox } from './stock-visuals';
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

describe('換貨 ⇄ 圖示的位置', () => {
  const FACINGS: readonly Facing[] = ['north', 'south', 'east', 'west'];
  const overlaps = (a: ScreenBox, b: ScreenBox) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const circleBox = ({ x, y, r }: { x: number; y: number; r: number }): ScreenBox => ({ left: x - r - 1, right: x + r + 1, top: y - r - 1, bottom: y + r + 1 });
  const fixture = (kind: 'shelf' | 'fridge', facing: Facing): Fixture => ({ id: 'f1', kind, facing, origin: { x: 4, y: 4 } });

  for (const kind of ['shelf', 'fridge'] as const) {
    for (const facing of FACINGS) {
      it(`${kind} 朝 ${facing}：標在格位所在的那一格上方，不壓到該格與相鄰格子的膠囊、派工標記與 ⇄`, () => {
        const f = fixture(kind, facing);
        const def = FIXTURES[kind];
        const tiles = footprintTiles(footprint(def, f));
        for (let slotIndex = 0; slotIndex < def.slots; slotIndex++) {
          const markers = changeoverMarkers([f], [{ fixtureId: 'f1', slotIndex }]);
          expect(markers).toHaveLength(1);
          const m = markers[0]!;
          // 標在與格位取用格相鄰的那一格設施上
          const access = slotAccessTile(def, f, slotIndex);
          expect(Math.abs(access.x - m.tile.x) + Math.abs(access.y - m.tile.y)).toBe(1);
          expect(tiles).toContainEqual(m.tile);

          const badge = changeoverBadgeBox(m);
          const { x, y } = m.tile;
          const origin = gridToScreen(x, y);
          for (const t of [m.tile, { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
            expect(overlaps(badge, stockAlertBox(kind, t, 2))).toBe(false);
            expect(overlaps(badge, circleBox(dispatchBadge(t)))).toBe(false);
            if (t === m.tile) continue;
            const shift = gridToScreen(t.x, t.y);
            const neighbour = changeoverBadgeBox({ x: m.x + shift.x - origin.x, y: m.y + shift.y - origin.y });
            expect(overlaps(badge, neighbour)).toBe(false);
          }
        }
      });
    }
  }

  it('同一格兩個格位都在換貨只標一個；沒有換貨、找不到設施或不是陳列櫃時不標', () => {
    const f = fixture('shelf', 'south');
    const all = Array.from({ length: FIXTURES.shelf.slots }, (_, slotIndex) => ({ fixtureId: 'f1', slotIndex }));
    expect(changeoverMarkers([f], all)).toHaveLength(footprintTiles(footprint(FIXTURES.shelf, f)).length);
    expect(changeoverMarkers([f], [])).toEqual([]);
    expect(changeoverMarkers([f], [{ fixtureId: 'missing', slotIndex: 0 }])).toEqual([]);
    expect(changeoverMarkers([{ ...f, kind: 'register' }], all)).toEqual([]);
  });
});
