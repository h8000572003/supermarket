import type { CommandError } from '../sim/game';

export const ERROR_MESSAGES: Record<CommandError, string> = {
  'out-of-bounds': '超出店面範圍',
  'overlaps-fixture': '與其他設施重疊',
  'blocks-entrance': '不能擋住入口',
  'blocks-backroom-door': '不能擋住倉庫門',
  'access-blocked': '取用格在店外或被擋住',
  'covers-access': '會壓住其他設施的取用格',
  unreachable: '會讓倉庫門或某些取用格無法從入口走到',
  'not-prep-phase': '只能在準備階段操作',
  'not-open-hours': '只能在營業時段操作',
  'not-report-phase': '只能在每日結算時操作',
  'insufficient-funds': '資金不足',
  'unknown-fixture': '找不到這個設施',
  'invalid-slot': '找不到這個格位',
  'unknown-product': '找不到這個商品',
  'category-locked': '這個商品類別尚未解鎖',
  'wrong-display': '這個商品不能放在這種陳列櫃',
  'invalid-price': '售價必須是正整數',
  'empty-order': '進貨單沒有任何品項',
  'below-min-order': '低於最低訂購量',
  'rush-limit-reached': '今天的緊急叫貨次數已用完',
  'rush-too-late': '22:00 之後不能緊急叫貨',
  'wrong-category': '這次叫貨不能訂這個類別的商品',
  'staff-full': '店員人數已達上限',
  'unknown-staff': '找不到這位店員',
  'dispatch-full': '派工標記已達上限（最多 2 個），請先取消一個',
  'already-dispatched': '這裡已經派工了',
  'not-dispatched': '這裡沒有派工',
  'slot-unassigned': '這個格位沒有指定商品',
  'slot-full': '這個格位已經補滿了',
  'no-backroom-stock': '倉庫沒有這個商品，可以改用緊急叫貨',
  'invalid-discount': '限時特價只能選 9 折、8 折或 7 折',
  'flash-sale-active': '這個商品已在限時特價中，結束後才能再開',
  'flash-sale-limit': '同時最多 2 個商品限時特價',
};

export const formatMoney = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('zh-TW')}`;

/** 遊戲分鐘數 → 「1 小時 05 分」或「45 分」 */
export const formatDuration = (minutes: number) => {
  const m = Math.max(0, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} 小時 ${String(m % 60).padStart(2, '0')} 分` : `${m} 分`;
};

/** 折扣檔位 → 「8 折」 */
export const formatDiscount = (tier: number) => `${Math.round(tier * 10)} 折`;

/** 一天中的分鐘數 → HH:MM */
export const formatTime = (minuteOfDay: number) => {
  const m = Math.floor(minuteOfDay);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
