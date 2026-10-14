import { productById } from '../catalog/products';

export interface OrderLine {
  readonly productId: string;
  readonly qty: number;
}

/** 店長在準備階段（開店前一晚）或營業時段截單前下的訂單，於送達日開店時送達倉庫 */
export interface PurchaseOrder {
  readonly lines: readonly OrderLine[];
  /** 下單的營業日 */
  readonly placedDay: number;
  /** 送達倉庫的營業日（於該日按下開店時、顧客進門前送達）：準備階段下的是即將開店的這天，營業中下的是下一個營業日。下單時決定（ADR 0005） */
  readonly deliveryDay: number;
  readonly total: number;
}

/** 這個時刻（含）之後當天不能再下進貨單（截單時間，ADR 0005） */
export const ORDER_CUTOFF_MINUTE = 18 * 60;

/** 每張進貨單的運費 */
export const SHIPPING_FEE = 300;

/** 明細的商品金額（不含運費）；含未知商品時回傳 NaN */
export function goodsTotal(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, l) => sum + (productById(l.productId)?.cost ?? NaN) * l.qty, 0);
}

/** 商品金額加運費；含未知商品時回傳 NaN */
export function orderTotal(lines: readonly OrderLine[]): number {
  return goodsTotal(lines) + SHIPPING_FEE;
}
