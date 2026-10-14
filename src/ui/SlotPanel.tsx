import { FIXTURES } from '../sim/catalog/fixtures';
import { CATEGORIES, PRODUCTS, productById } from '../sim/catalog/products';
import { totalQty } from '../sim/inventory/batch';
import type { Fixture } from '../sim/store/store-layout';
import type { Controller } from './controller';

const productName = (id: string | null) => (id ? (productById(id)?.name ?? id) : null);

/**
 * 選取陳列櫃時：指定每個格位陳列的商品。
 * 準備階段立即生效；營業中發起換貨（店員下架後才改；空格位立即生效），
 * 換貨中顯示「換貨中：舊商品 → 新商品」，換成不指定商品時顯示「→ 清空」；下架前選回原商品即取消換貨。
 */
export function SlotPanel({ controller, fixture }: { controller: Controller; fixture: Fixture }) {
  const open = controller.game.phase === 'open';
  const { game, interaction } = controller;
  const def = FIXTURES[fixture.kind];
  const options = PRODUCTS.filter((p) => CATEGORIES[p.category].display === fixture.kind);

  const assign = (index: number, value: string) => {
    const r = game.assignSlot(fixture.id, index, value || null);
    if (r.ok) interaction.update({ message: null });
    else controller.showError(r.error);
  };

  return (
    <div className="panel slot-panel">
      {open && (
        <strong className="slot-panel-heading">
          更換商品<small>店員下架舊商品後換上；空格位立即換上</small>
        </strong>
      )}
      {game.slots(fixture.id).map((slot, i) => {
        const changeover = game.changeover(fixture.id, i);
        const shown = changeover ? changeover.productId : slot.productId;
        return (
          <label key={i} className={changeover ? 'slot slot-in-changeover' : 'slot'}>
            <span className="slot-label">格位 {i + 1}</span>
            <select value={shown ?? ''} onChange={(e) => assign(i, e.target.value)}>
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
            {changeover && (
              <span className="slot-changeover">
                換貨中：{productName(slot.productId) ?? '未指定'} → {productName(changeover.productId) ?? '清空'}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

