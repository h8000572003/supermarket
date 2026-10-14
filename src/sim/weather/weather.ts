import type { Rng } from '../rng';

/** 營業日的天氣 */
export type Weather = 'sunny' | 'rainy' | 'hot' | 'cold';

export const WEATHERS: readonly Weather[] = ['sunny', 'rainy', 'hot', 'cold'];

export const WEATHER_NAMES: Record<Weather, string> = { sunny: '晴', rainy: '雨', hot: '熱', cold: '冷' };

/** 第 1 個營業日固定晴天 */
export const FIRST_DAY_WEATHER: Weather = 'sunny';

/** 同一種天氣最多連續的天數 */
export const MAX_WEATHER_STREAK = 3;

/** 各天氣出現的相對權重（未受連續上限排除時） */
const WEATHER_WEIGHTS: Record<Weather, number> = { sunny: 4, rainy: 2, hot: 2, cold: 2 };

/** 星期；第 1 個營業日為星期一 */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: '週一',
  tue: '週二',
  wed: '週三',
  thu: '週四',
  fri: '週五',
  sat: '週六',
  sun: '週日',
};

/** 第 day 個營業日（從 1 開始）是星期幾 */
export function weekdayOf(day: number): Weekday {
  return WEEKDAYS[(((day - 1) % 7) + 7) % 7] as Weekday;
}

export function isWeekend(weekday: Weekday): boolean {
  return weekday === 'sat' || weekday === 'sun';
}

/** 某個營業日的天氣與星期 */
export interface DayConditions {
  readonly day: number;
  readonly weather: Weather;
  readonly weekday: Weekday;
  readonly weekend: boolean;
}

/** weekdayOffset 只供測試（讓第 1 天不是週一）；遊戲中一律為 0 */
export function dayConditions(day: number, weather: Weather, weekdayOffset = 0): DayConditions {
  const weekday = weekdayOf(day + weekdayOffset);
  return { day, weather, weekday, weekend: isWeekend(weekday) };
}

/**
 * 依權重擲下一天的天氣；previous 已連續 streak 天時排除它，
 * 讓同一種天氣不連續超過 MAX_WEATHER_STREAK 天。
 */
export function rollWeather(rng: Rng, previous: Weather, streak: number): Weather {
  const pool = WEATHERS.filter((w) => streak < MAX_WEATHER_STREAK || w !== previous);
  const total = pool.reduce((sum, w) => sum + WEATHER_WEIGHTS[w], 0);
  let roll = rng.next() * total;
  for (const w of pool) {
    roll -= WEATHER_WEIGHTS[w];
    if (roll < 0) return w;
  }
  return pool[pool.length - 1] as Weather;
}

/** 天氣專用亂數流的種子：由遊戲種子衍生，與主亂數流分開，讓天氣不改變顧客與狀況的亂數序列 */
export function weatherSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
}

/** 已知今天與明天的天氣；進入下一天時明天變成今天、再擲新的明天 */
export interface WeatherState {
  readonly today: Weather;
  readonly tomorrow: Weather;
  /** 到明天為止，明天的天氣已連續幾天（含明天） */
  readonly tomorrowStreak: number;
}

/** 第 1 天的天氣狀態：今天晴，擲出第 2 天 */
export function initialWeather(rng: Rng): WeatherState {
  const tomorrow = rollWeather(rng, FIRST_DAY_WEATHER, 1);
  return { today: FIRST_DAY_WEATHER, tomorrow, tomorrowStreak: tomorrow === FIRST_DAY_WEATHER ? 2 : 1 };
}

export function advanceWeather(rng: Rng, s: WeatherState): WeatherState {
  const next = rollWeather(rng, s.tomorrow, s.tomorrowStreak);
  return { today: s.tomorrow, tomorrow: next, tomorrowStreak: next === s.tomorrow ? s.tomorrowStreak + 1 : 1 };
}
