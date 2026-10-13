import { FIXTURES } from '../sim/catalog/fixtures';
import { productById } from '../sim/catalog/products';
import { MAX_DISPATCHES } from '../sim/game';
import type { DispatchTarget } from '../sim/game';
import { totalQty } from '../sim/inventory/batch';
import type { Fixture } from '../sim/store/store-layout';
import type { Controller } from './controller';

/** 營業中選取陳列櫃或收銀台時：派工（優先處理）與取消 */
export function DispatchPanel({
  controller,
  fixture,
  showName = true,
}: {
  controller: Controller;
  fixture: Fixture;
  /** 抽屜標題已有設施名稱時不再重複 */
  showName?: boolean;
}) {
  const { game } = controller;
  const def = FIXTURES[fixture.kind];

  const button = (target: DispatchTarget) => {
    const marked = game.isDispatched(target);
    return (
      <button className={marked ? 'active' : ''} onClick={() => controller.toggleDispatch(target)}>
        {marked ? '取消優先' : '優先處理'}
      </button>
    );
  };

  return (
    <div className="panel dispatch-panel">
      <strong>
        {showName && def.name}
        <small className="dispatch-count">
          派工 {game.dispatches.length}/{MAX_DISPATCHES}
        </small>
      </strong>
      {fixture.kind === 'register' ? (
        <div className="slot">
          <span className="slot-label slot-product">排隊 {game.queueLength(fixture.id)} 人</span>
          {button({ kind: 'register', registerId: fixture.id })}
        </div>
      ) : (
        game.slots(fixture.id).map((slot, i) => (
          <div key={i} className="slot">
            <span className="slot-label">格位 {i + 1}</span>
            <span className="slot-product">{slot.productId ? productById(slot.productId)?.name : '（未指定）'}</span>
            <span className="slot-stock">
              {totalQty(slot.batches)}/{def.slotCapacity}
            </span>
            {slot.productId && button({ kind: 'slot', fixtureId: fixture.id, slotIndex: i })}
          </div>
        ))
      )}
    </div>
  );
}
