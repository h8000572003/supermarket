import { productById } from '../catalog/products';

export interface OrderLine {
  readonly productId: string;
  readonly qty: number;
}

/** 店長在準備階段下的訂單，下一個營業日開店前送達倉庫 */
export interface PurchaseOrder {
  readonly lines: readonly OrderLine[];
  /** 下單的營業日 */
  readonly placedDay: number;
  readonly total: number;
}

/** 每張進貨單的運費 */
export const SHIPPING_FEE = 300;

/** 商品金額加運費；含未知商品時回傳 NaN */
export function orderTotal(lines: readonly OrderLine[]): number {
  const goods = lines.reduce((sum, l) => sum + (productById(l.productId)?.cost ?? NaN) * l.qty, 0);
  return goods + SHIPPING_FEE;
}
