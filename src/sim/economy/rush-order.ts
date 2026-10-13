import type { CategoryId } from '../catalog/products';
import type { OrderLine } from './purchase-order';
import { SHIPPING_FEE } from './purchase-order';

/** 緊急叫貨的運費：一般進貨單運費的兩倍 */
export const RUSH_SHIPPING_FEE = SHIPPING_FEE * 2;
/** 下單後幾個遊戲分鐘送達倉庫 */
export const RUSH_DELIVERY_MINUTES = 2 * 60;
/** 這個時刻（含）之後不能再下緊急叫貨 */
export const RUSH_LAST_ORDER_MINUTE = 22 * 60;
/** 每個營業日可下的緊急叫貨次數 */
export const RUSH_ORDERS_PER_DAY = 1;

/**
 * 緊急叫貨的條件。一般由店長下單時用 STANDARD_RUSH_TERMS；
 * 狀況（例如「熱浪」）可給免運費、不佔每日次數、只限某類別的條件。
 */
export interface RushOrderTerms {
  readonly shippingFee: number;
  /** 是否佔用每天的緊急叫貨次數 */
  readonly countsTowardDailyLimit: boolean;
  /** 只能訂這個類別的商品；undefined 表示不限 */
  readonly category?: CategoryId;
}

export const STANDARD_RUSH_TERMS: RushOrderTerms = {
  shippingFee: RUSH_SHIPPING_FEE,
  countsTowardDailyLimit: true,
};

/** 免運費、不佔每日次數、只限指定類別（供狀況使用，例如熱浪的飲料） */
export function freeRushTerms(category: CategoryId): RushOrderTerms {
  return { shippingFee: 0, countsTowardDailyLimit: false, category };
}

/** 營業中下的緊急叫貨；送達前可查詢預計送達時刻 */
export interface RushOrder {
  readonly lines: readonly OrderLine[];
  /** 下單的營業日 */
  readonly placedDay: number;
  /** 下單時刻（一天中的分鐘數） */
  readonly placedMinute: number;
  /** 預計送達時刻（一天中的分鐘數）；晚於打烊時改於下一個營業日開店前送達 */
  readonly etaMinute: number;
  /** 商品金額（計入進貨成本） */
  readonly goods: number;
  /** 運費（每日結算另列「緊急叫貨運費」） */
  readonly shipping: number;
  readonly total: number;
}
