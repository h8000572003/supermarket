import { productById } from '../sim/catalog/products';
import type { Game } from '../sim/game';
import { useGameVersion } from './hooks';

/** 商品與進貨面板中的在途進貨：已下單、尚未送達的一般進貨單（準備階段與營業時段都顯示） */
export function PendingOrdersSection({ game }: { game: Game }) {
  useGameVersion(game);
  const orders = game.pendingOrders;
  if (orders.length === 0) return null;
  // 準備階段是開店前一晚，「明天」就是即將開店的這天；營業中與結算時是下一個營業日
  const tomorrow = game.phase === 'prep' ? game.day : game.day + 1;
  return (
    <section className="pending-orders" aria-label="在途進貨">
      <h3>
        在途進貨<small>{orders.length} 張</small>
      </h3>
      <ul>
        {orders.map((o, i) => (
          <li key={i}>
            {o.lines.map((l) => `${productById(l.productId)?.name ?? l.productId} ${l.qty}`).join('、')}，
            <strong>{o.deliveryDay === tomorrow ? '明天開店前' : `第 ${o.deliveryDay} 天開店前`}</strong>送達
          </li>
        ))}
      </ul>
    </section>
  );
}
