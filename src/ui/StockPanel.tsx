import { useState } from 'react';
import { CATEGORIES, PRODUCTS } from '../sim/catalog/products';
import { SHIPPING_FEE, orderTotal } from '../sim/economy/purchase-order';
import type { Controller } from './controller';
import { useGameVersion } from './hooks';
import { ERROR_MESSAGES, formatMoney } from './messages';

/** 商品與進貨：調整售價、查看倉庫庫存、下進貨單 */
export function StockPanel({ controller, onClose }: { controller: Controller; onClose: () => void }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});

  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([productId, q]) => ({ productId, qty: q }));
  const total = lines.length > 0 ? orderTotal(lines) : 0;

  const submit = () => {
    const r = game.submitPurchaseOrder(lines);
    if (r.ok) {
      setQty({});
      interaction.update({ message: null });
    } else {
      interaction.update({ message: ERROR_MESSAGES[r.error] });
    }
  };

  const commitPrice = (productId: string) => {
    const draft = priceDraft[productId];
    if (draft === undefined) return;
    const r = game.setSalePrice(productId, Number(draft));
    if (!r.ok) interaction.update({ message: ERROR_MESSAGES[r.error] });
    setPriceDraft((d) => {
      const next = { ...d };
      delete next[productId];
      return next;
    });
  };

  const pendingQty = (productId: string) =>
    game.pendingOrders.flatMap((o) => o.lines).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);

  return (
    <div className="side-panel">
      <header>
        <h2>商品與進貨</h2>
        <button onClick={onClose} aria-label="關閉">
          ✕
        </button>
      </header>
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th>進價</th>
            <th>建議售價</th>
            <th>售價</th>
            <th>倉庫</th>
            <th>在途</th>
            <th>訂購量</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => {
            const unlocked = game.isUnlocked(p.category);
            return (
              <tr key={p.id} className={unlocked ? '' : 'locked'}>
                <td>
                  {p.name}
                  <small>
                    {CATEGORIES[p.category].name}
                    {unlocked ? '' : '・未解鎖'}
                  </small>
                </td>
                <td>{formatMoney(p.cost)}</td>
                <td>{formatMoney(p.suggestedPrice)}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={priceDraft[p.id] ?? game.salePrice(p.id)}
                    disabled={!unlocked}
                    onChange={(e) => setPriceDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    onBlur={() => commitPrice(p.id)}
                    onKeyDown={(e) => e.key === 'Enter' && commitPrice(p.id)}
                  />
                </td>
                <td>{game.backroomQty(p.id)}</td>
                <td>{pendingQty(p.id) || ''}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={p.minOrder}
                    placeholder={`≥${p.minOrder}`}
                    value={qty[p.id] || ''}
                    disabled={!unlocked}
                    onChange={(e) => setQty((q) => ({ ...q, [p.id]: Math.max(0, Math.floor(Number(e.target.value))) }))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <footer>
        <span>
          小計 {formatMoney(Math.max(0, total - (lines.length ? SHIPPING_FEE : 0)))} ＋ 運費 {formatMoney(SHIPPING_FEE)} ＝{' '}
          <strong>{formatMoney(lines.length ? total : 0)}</strong>
        </span>
        <button className="primary" disabled={lines.length === 0} onClick={submit}>
          下單（明天開店前送達）
        </button>
      </footer>
    </div>
  );
}
