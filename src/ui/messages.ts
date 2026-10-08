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
  'staff-full': '店員人數已達上限',
  'unknown-staff': '找不到這位店員',
};

export const formatMoney = (n: number) => `$${n.toLocaleString('zh-TW')}`;

/** 一天中的分鐘數 → HH:MM */
export const formatTime = (minuteOfDay: number) => {
  const m = Math.floor(minuteOfDay);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
