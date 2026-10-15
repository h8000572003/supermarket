import { CATEGORIES } from '../sim/catalog/products';
import { NUISANCES, NUISANCE_KINDS } from '../sim/nuisances/nuisances';
import type { NuisanceSummary } from '../sim/nuisances/nuisances';
import type { CommandError } from '../sim/game';
import type { DailyGoalReward, DailyGoalStatus } from '../sim/goals/daily-goal';
import { WEATHER_NAMES, WEEKDAY_NAMES } from '../sim/weather/weather';
import type { DayConditions, Weather } from '../sim/weather/weather';

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
  'order-cutoff': '18:00 之後今日已截單，可改用緊急叫貨',
  'wrong-category': '這次叫貨不能訂這個類別的商品',
  'staff-full': '店員人數已達上限',
  'unknown-staff': '找不到這位店員',
  'dispatch-full': '派工標記已達上限（最多 2 個），請先取消一個',
  'already-dispatched': '這裡已經派工了',
  'not-dispatched': '這裡沒有派工',
  'unknown-nuisance': '這個麻煩已經不在了',
  'slot-unassigned': '這個格位沒有指定商品',
  'slot-full': '這個格位已經補滿了',
  'no-backroom-stock': '倉庫沒有這個商品，可以改用緊急叫貨',
  'invalid-discount': '限時特價只能選 9 折、8 折或 7 折',
  'flash-sale-active': '這個商品已在限時特價中，結束後才能再開',
  'flash-sale-limit': '同時最多 2 個商品限時特價',
  'no-pending-incident': '目前沒有需要處理的狀況',
  'invalid-incident-option': '沒有這個選項',
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

/** 天氣圖示；加上 U+FE0E 強制以文字字形呈現，四種圖示風格一致 */
export const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '\u2600\uFE0E',
  rainy: '\u2602\uFE0E',
  hot: '\u2668\uFE0E',
  cold: '\u2744\uFE0E',
};

/** 狀態列用的短字：「☀ 週一」 */
export const formatConditions = (c: DayConditions) => `${WEATHER_ICONS[c.weather]} ${WEEKDAY_NAMES[c.weekday]}`;

/** 給螢幕閱讀器與提示文字的完整說法：「晴天，週一」 */
export const describeConditions = (c: DayConditions) =>
  `${WEATHER_NAMES[c.weather]}天，${WEEKDAY_NAMES[c.weekday]}${c.weekend ? '（週末）' : ''}`;

/** 每日目標的獎勵：「$800」「口碑 +2」 */
export const formatGoalReward = (reward: DailyGoalReward) =>
  reward.type === 'funds' ? formatMoney(reward.amount) : `口碑 +${reward.delta}`;

/** 每日目標目前的數字，給進度條與狀態列用：「12 / 40」「0 人」「剩 5 件」 */
export function formatGoalCount(goal: DailyGoalStatus): string {
  switch (goal.kind) {
    case 'sell-category':
    case 'served':
      return `${goal.current} / ${goal.target}`;
    case 'no-stockout-empty':
      return `缺貨空手 ${goal.current} 人`;
    case 'zero-waste':
      return goal.current === 0 ? '已全部賣完' : `還剩 ${goal.current} 件`;
  }
}

/** 狀態列用的短字：「飲料 12/40」「結帳 30/120」「缺貨空手 0」「到期鮮食 5」 */
export function formatGoalShort(goal: DailyGoalStatus): string {
  switch (goal.kind) {
    case 'sell-category':
      return `${goal.category ? CATEGORIES[goal.category].name : '銷量'} ${goal.current}/${goal.target}`;
    case 'served':
      return `結帳 ${goal.current}/${goal.target}`;
    case 'no-stockout-empty':
      return `缺貨空手 ${goal.current}`;
    case 'zero-waste':
      return `到期鮮食 ${goal.current}`;
  }
}

/** 每日目標的進度比例（0–1）；「至多」類目標目前守住為 1 */
export function goalProgressRatio(goal: DailyGoalStatus): number {
  if (goal.kind === 'sell-category' || goal.kind === 'served')
    return Math.min(1, goal.current / Math.max(1, goal.target));
  return goal.met ? 1 : 0;
}

/** 每日結算的麻煩摘要；今天沒有麻煩時回傳空字串 */
export function formatNuisances(summary: NuisanceSummary): string {
  const kinds = NUISANCE_KINDS.filter((k) => summary.byKind[k].appeared > 0);
  if (kinds.length === 0) return '';
  const appeared = kinds.reduce((s, k) => s + summary.byKind[k].appeared, 0);
  const handled = kinds.reduce((s, k) => s + summary.byKind[k].handled, 0);
  const detail = kinds.map((k) => `${NUISANCES[k].name} ${summary.byKind[k].appeared}`).join('、');
  return `出現 ${appeared} 個（${detail}），處理 ${handled} 個，累計在場 ${formatDuration(summary.minutes)}。在場越久，來客越少、顧客越不滿意。`;
}
