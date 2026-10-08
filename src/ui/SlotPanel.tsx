import { FIXTURES } from '../sim/catalog/fixtures';
import { CATEGORIES, PRODUCTS } from '../sim/catalog/products';
import { totalQty } from '../sim/inventory/batch';
import type { Fixture } from '../sim/store/store-layout';
import type { Controller } from './controller';
import { ERROR_MESSAGES } from './messages';

/** 選取陳列櫃時：指定每個格位陳列的商品 */
export function SlotPanel({ controller, fixture }: { controller: Controller; fixture: Fixture }) {
  const { game, interaction } = controller;
  const def = FIXTURES[fixture.kind];
  const options = PRODUCTS.filter((p) => CATEGORIES[p.category].display === fixture.kind);

  const assign = (index: number, value: string) => {
    const r = game.assignSlot(fixture.id, index, value || null);
    interaction.update({ message: r.ok ? null : ERROR_MESSAGES[r.error] });
  };

  return (
    <div className="panel slot-panel">
      {game.slots(fixture.id).map((slot, i) => (
        <label key={i} className="slot">
          <span className="slot-label">格位 {i + 1}</span>
          <select value={slot.productId ?? ''} onChange={(e) => assign(i, e.target.value)}>
            <option value="">（未指定）</option>
            {options.map((p) => (
              <option key={p.id} value={p.id} disabled={!game.isUnlocked(p.category)}>
                {p.name}
                {game.isUnlocked(p.category) ? '' : '（未解鎖）'}
              </option>
            ))}
          </select>
          <span className="slot-stock">
            {totalQty(slot.batches)}/{def.slotCapacity}
          </span>
        </label>
      ))}
    </div>
  );
}

