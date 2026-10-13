import { useState } from 'react';
import { PRODUCTS, productById } from '../sim/catalog/products';
import { CLOSE_MINUTE } from '../sim/clock/clock';
import { goodsTotal } from '../sim/economy/purchase-order';
import {
  RUSH_DELIVERY_MINUTES,
  RUSH_LAST_ORDER_MINUTE,
  RUSH_ORDERS_PER_DAY,
  RUSH_SHIPPING_FEE,
} from '../sim/economy/rush-order';
import type { Controller } from './controller';
import { useGameVersion } from './hooks';
import { formatMoney, formatTime } from './messages';
import { snapOrderQty } from './order-qty';
import { Stepper } from './Stepper';

/** 預計送達時刻；晚於打烊時改為下一個營業日開店前 */
const formatEta = (minute: number) => (minute > CLOSE_MINUTE ? '明天開店前' : formatTime(minute));

/** 商品與進貨面板中的緊急叫貨區（營業時段才顯示） */
export function RushOrderSection({ controller }: { controller: Controller }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const [qty, setQty] = useState<Record<string, number>>({});

  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([productId, q]) => ({ productId, qty: q }));
  const goods = lines.length > 0 ? goodsTotal(lines) : 0;
  const left = game.rushOrdersLeftToday;
  const tooLate = game.minuteOfDay >= RUSH_LAST_ORDER_MINUTE;

  const submit = () => {
    const r = game.placeRushOrder(lines);
    if (r.ok) {
      setQty({});
      interaction.update({ message: null });
    } else {
      controller.showError(r.error);
    }
  };

  return (
    <section className="rush-order" aria-label="緊急叫貨">
      <h3>
        緊急叫貨
        <small>
          今日剩餘 {left}/{RUSH_ORDERS_PER_DAY} 次・運費 {formatMoney(RUSH_SHIPPING_FEE)}・下單後{' '}
          {RUSH_DELIVERY_MINUTES / 60} 小時送達倉庫・{formatTime(RUSH_LAST_ORDER_MINUTE)} 截止
        </small>
      </h3>
      {game.rushOrders.map((o, i) => (
        <p key={i} className="rush-pending">
          送貨中：{o.lines.map((l) => `${productById(l.productId)?.name} ${l.qty}`).join('、')}，預計{' '}
          <strong>{formatEta(o.etaMinute)}</strong> 送達
        </p>
      ))}
      <div className="rush-lines">
        {PRODUCTS.filter((p) => game.isUnlocked(p.category)).map((p) => (
          <label key={p.id}>
            <span>{p.name}</span>
            <Stepper
              label={`${p.name}緊急叫貨量`}
              value={qty[p.id] ?? 0}
              step={p.minOrder}
              placeholder={`≥${p.minOrder}`}
              disabled={left === 0 || tooLate}
              onChange={(v) => setQty((q) => ({ ...q, [p.id]: snapOrderQty(v, q[p.id] ?? 0, p.minOrder) }))}
            />
          </label>
        ))}
      </div>
      <div className="rush-submit">
        <span>
          商品 {formatMoney(goods)} ＋ 運費 {formatMoney(RUSH_SHIPPING_FEE)} ＝{' '}
          <strong>{formatMoney(lines.length ? goods + RUSH_SHIPPING_FEE : 0)}</strong>
        </span>
        <button className="primary" disabled={left === 0 || tooLate || lines.length === 0} onClick={submit}>
          {left === 0
            ? '今日已叫貨'
            : tooLate
              ? '已過截止時間'
              : `緊急叫貨（預計 ${formatEta(game.minuteOfDay + RUSH_DELIVERY_MINUTES)} 送達）`}
        </button>
      </div>
    </section>
  );
}
