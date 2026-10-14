import { useState } from 'react';
import { CATEGORIES, CATEGORY_IDS, PRODUCTS } from '../sim/catalog/products';
import type { CategoryId, ProductDef } from '../sim/catalog/products';
import { FLASH_SALE_TIERS, MAX_FLASH_SALES } from '../sim/economy/flash-sale';
import { ORDER_CUTOFF_MINUTE, SHIPPING_FEE, orderTotal } from '../sim/economy/purchase-order';
import { RUSH_LAST_ORDER_MINUTE } from '../sim/economy/rush-order';
import { phaseError } from '../sim/game';
import type { Controller } from './controller';
import { FullScreenPage } from './FullScreenPage';
import { useGameVersion } from './hooks';
import { useNarrow } from './media';
import { formatDiscount, formatDuration, formatMoney, formatTime } from './messages';
import { snapOrderQty } from './order-qty';
import { PendingOrdersSection } from './PendingOrdersSection';
import { RushOrderSection } from './RushOrderSection';
import { Stepper } from './Stepper';

interface StockPanelProps {
  controller: Controller;
  onClose: () => void;
}

/** 商品與進貨：調整售價、查看倉庫庫存、下進貨單；營業時段售價鎖定、進貨單 18:00 截單，可開始限時特價 */
export function StockPanel(props: StockPanelProps) {
  useGameVersion(props.controller.game);
  const order = useStockOrder(props.controller);
  return useNarrow() ? <StockPage {...props} order={order} /> : <StockTable {...props} order={order} />;
}

type StockOrder = ReturnType<typeof useStockOrder>;

/** 寬版表格與手機卡片共用的進貨單狀態與指令 */
function useStockOrder(controller: Controller) {
  const { game, interaction } = controller;
  const [qty, setQtyMap] = useState<Record<string, number>>({});

  const editable = phaseError(game.phase, 'prep') === null;
  const openHours = phaseError(game.phase, 'open') === null;
  // 一般進貨單：準備階段或營業時段截單前可下（ADR 0005）
  const cutOff = openHours && game.minuteOfDay >= ORDER_CUTOFF_MINUTE;
  const canOrder = editable || (openHours && !cutOff);
  const flashSales = game.flashSales;
  const flashSaleFull = flashSales.length >= MAX_FLASH_SALES;
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([productId, q]) => ({ productId, qty: q }));
  const total = lines.length > 0 ? orderTotal(lines) : 0;

  return {
    editable,
    openHours,
    canOrder,
    cutOff,
    flashSales,
    flashSaleFull,
    lines,
    total,
    qty: (productId: string) => qty[productId] ?? 0,
    setQty: (p: ProductDef, next: number) =>
      setQtyMap((q) => ({ ...q, [p.id]: snapOrderQty(next, q[p.id] ?? 0, p.minOrder) })),
    submit: () => {
      const r = game.submitPurchaseOrder(lines);
      if (r.ok) {
        setQtyMap({});
        interaction.update({ message: null });
      } else {
        controller.showError(r.error);
      }
    },
    setPrice: (productId: string, price: number) => {
      const r = game.setSalePrice(productId, price);
      if (!r.ok) controller.showError(r.error);
    },
    startFlashSale: (productId: string, tier: number) => {
      const r = game.startFlashSale(productId, tier);
      if (r.ok) interaction.update({ message: null });
      else controller.showError(r.error);
    },
    pendingQty: (productId: string) =>
      game.pendingOrders.flatMap((o) => o.lines).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0),
    // 準備階段是開店前一晚、營業中下的單隔天送達：兩者都是「明天開店前」
    submitLabel: '下單（明天開店前送達）',
  };
}

function OpenHoursNote({ order }: { order: StockOrder }) {
  return (
    <>
      <p className="side-panel-note" role="note">
        營業中售價請在準備階段調整。限時特價持續 2 小時，同時最多 {MAX_FLASH_SALES} 個（{order.flashSales.length}/
        {MAX_FLASH_SALES}）。
      </p>
      <OrderCutoffNote order={order} />
    </>
  );
}

/** 營業中一般進貨單的截單提示 */
function OrderCutoffNote({ order }: { order: StockOrder }) {
  return (
    <p className={order.cutOff ? 'side-panel-note order-cutoff passed' : 'side-panel-note order-cutoff'} role="status">
      {order.cutOff
        ? `一般進貨單今日已截單，可改用緊急叫貨（${formatTime(RUSH_LAST_ORDER_MINUTE)} 前）`
        : `一般進貨單 ${formatTime(ORDER_CUTOFF_MINUTE)} 截單・明天開店前送達`}
    </p>
  );
}

function FlashSaleControl({ product, unlocked, order }: { product: ProductDef; unlocked: boolean; order: StockOrder }) {
  const sale = order.flashSales.find((s) => s.productId === product.id);
  if (sale) {
    return (
      <span className="flash-sale-active">
        {formatDiscount(sale.tier)} {formatMoney(sale.price)}
        <small>剩 {formatDuration(sale.remainingMinutes)}</small>
      </span>
    );
  }
  return (
    <span className="flash-sale-tiers" role="group" aria-label={`${product.name}限時特價`}>
      {FLASH_SALE_TIERS.map((tier) => (
        <button
          key={tier}
          disabled={!unlocked || order.flashSaleFull}
          title={order.flashSaleFull ? `同時最多 ${MAX_FLASH_SALES} 個商品限時特價` : undefined}
          onClick={() => order.startFlashSale(product.id, tier)}
        >
          {formatDiscount(tier)}
        </button>
      ))}
    </span>
  );
}

function OrderSummary({ order }: { order: StockOrder }) {
  const { lines, total } = order;
  return (
    <span className="order-summary">
      小計 {formatMoney(Math.max(0, total - (lines.length ? SHIPPING_FEE : 0)))} ＋ 運費 {formatMoney(SHIPPING_FEE)} ＝{' '}
      <strong>{formatMoney(lines.length ? total : 0)}</strong>
    </span>
  );
}

function StockTable({ controller, onClose, order }: StockPanelProps & { order: StockOrder }) {
  const { game } = controller;
  const { editable, openHours, canOrder } = order;

  return (
    <div className={openHours ? 'side-panel open-hours' : 'side-panel'}>
      <header>
        <h2>商品與進貨</h2>
        <button onClick={onClose} aria-label="關閉">
          ✕
        </button>
      </header>
      {openHours && <OpenHoursNote order={order} />}
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
            {openHours && <th>限時特價</th>}
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
                  <Stepper
                    label={`${p.name}售價`}
                    value={game.salePrice(p.id) ?? p.suggestedPrice}
                    min={1}
                    disabled={!unlocked || !editable}
                    onChange={(v) => order.setPrice(p.id, v)}
                  />
                </td>
                <td>{game.backroomQty(p.id)}</td>
                <td>{order.pendingQty(p.id) || ''}</td>
                <td>
                  <Stepper
                    label={`${p.name}訂購量`}
                    value={order.qty(p.id)}
                    step={p.minOrder}
                    placeholder={`≥${p.minOrder}`}
                    disabled={!unlocked || !canOrder}
                    onChange={(v) => order.setQty(p, v)}
                  />
                </td>
                {openHours && (
                  <td className="flash-sale-cell">
                    <FlashSaleControl product={p} unlocked={unlocked} order={order} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <PendingOrdersSection game={game} />
      {openHours && <RushOrderSection controller={controller} />}
      <footer>
        <OrderSummary order={order} />
        <button className="primary" disabled={!canOrder || order.lines.length === 0} onClick={order.submit}>
          {order.submitLabel}
        </button>
      </footer>
    </div>
  );
}

type Tab = 'all' | CategoryId;

/** 手機版：全螢幕頁面，每個商品一張卡片，點開調整售價與訂購量 */
function StockPage({ controller, onClose, order }: StockPanelProps & { order: StockOrder }) {
  const { game } = controller;
  const { editable, openHours, canOrder } = order;
  const [tab, setTab] = useState<Tab>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // 未解鎖的商品排在最後
  const products = [...PRODUCTS.filter((p) => tab === 'all' || p.category === tab)].sort(
    (a, b) => Number(!game.isUnlocked(a.category)) - Number(!game.isUnlocked(b.category)),
  );

  return (
    <FullScreenPage
      title="商品與進貨"
      onBack={onClose}
      tabs={
        <div className="tabs" role="tablist" aria-label="商品類別">
          {(['all', ...CATEGORY_IDS] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'all' ? '全部' : CATEGORIES[t].name}
            </button>
          ))}
        </div>
      }
      footer={
        canOrder ? (
          <>
            <OrderSummary order={order} />
            <button className="primary" disabled={order.lines.length === 0} onClick={order.submit}>
              {order.submitLabel}
            </button>
          </>
        ) : undefined
      }
    >
      {openHours && <OpenHoursNote order={order} />}
      <ul className="stock-cards">
        {products.map((p) => {
          const unlocked = game.isUnlocked(p.category);
          const price = game.salePrice(p.id) ?? p.suggestedPrice;
          const pending = order.pendingQty(p.id);
          const ordering = order.qty(p.id);
          const sale = order.flashSales.find((s) => s.productId === p.id);
          const open = expanded === p.id;
          const priceClass = price < p.suggestedPrice ? 'cheap' : price > p.suggestedPrice ? 'pricey' : '';
          return (
            <li key={p.id} className={['stock-card', unlocked ? '' : 'locked', open ? 'open' : ''].join(' ')}>
              <button
                className="stock-card-summary"
                aria-expanded={open}
                disabled={!unlocked}
                onClick={() => setExpanded(open ? null : p.id)}
              >
                <span className="stock-card-name">
                  {p.name}
                  <small>
                    {CATEGORIES[p.category].name}
                    {unlocked ? '' : '・未解鎖'}
                  </small>
                </span>
                <span className="stock-card-stock">
                  倉庫 {game.backroomQty(p.id)}
                  {pending > 0 && <small>在途 {pending}</small>}
                  {ordering > 0 && <small className="ordering">訂 {ordering}</small>}
                </span>
                <span className={`stock-card-price ${priceClass}`}>
                  {sale ? formatMoney(sale.price) : formatMoney(price)}
                  {sale && <small>{formatDiscount(sale.tier)}</small>}
                </span>
              </button>
              {open && (
                <div className="stock-card-detail">
                  <p className="stock-card-ref">
                    進價 {formatMoney(p.cost)} · 建議售價 {formatMoney(p.suggestedPrice)} · 最低訂購 {p.minOrder}
                  </p>
                  <label>
                    <span>售價</span>
                    <Stepper
                      label={`${p.name}售價`}
                      value={price}
                      min={1}
                      disabled={!editable}
                      onChange={(v) => order.setPrice(p.id, v)}
                    />
                  </label>
                  {canOrder && (
                    <label>
                      <span>訂購量</span>
                      <Stepper
                        label={`${p.name}訂購量`}
                        value={ordering}
                        step={p.minOrder}
                        placeholder={`≥${p.minOrder}`}
                        onChange={(v) => order.setQty(p, v)}
                      />
                    </label>
                  )}
                  {openHours && (
                    <div className="stock-card-sale">
                      <span>限時特價</span>
                      <FlashSaleControl product={p} unlocked={unlocked} order={order} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <PendingOrdersSection game={game} />
      {openHours && <RushOrderSection controller={controller} />}
    </FullScreenPage>
  );
}
