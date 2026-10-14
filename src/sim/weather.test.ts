import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Rng } from './rng';
import { playThroughDay, runOpenHours } from './test-helpers';
import { MAX_WEATHER_STREAK, WEATHERS, isWeekend, rollWeather, weekdayOf } from './weather/weather';
import type { DayConditions, Weather } from './weather/weather';

/** 不放任何設施、沒有顧客的店，快速推進營業日 */
const emptyGame = (seed: number) => new Game({ seed, customerArrivals: false });

/** 從第 1 天起依序記錄每天準備階段的今天與明日預報 */
function recordDays(game: Game, days: number): { today: DayConditions; forecast: DayConditions }[] {
  const seen = [{ today: game.today, forecast: game.forecast }];
  while (seen.length < days) {
    playThroughDay(game);
    seen.push({ today: game.today, forecast: game.forecast });
  }
  return seen;
}

function longestStreak(weathers: readonly Weather[]): number {
  let longest = 0;
  let run = 0;
  weathers.forEach((w, i) => {
    run = i > 0 && weathers[i - 1] === w ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

describe('星期', () => {
  it('第 1 天為週一；第 6、7 天為週末；第 8 天回到週一', () => {
    expect(weekdayOf(1)).toBe('mon');
    expect(weekdayOf(5)).toBe('fri');
    expect([weekdayOf(6), weekdayOf(7)]).toEqual(['sat', 'sun']);
    expect(weekdayOf(8)).toBe('mon');
    expect(weekdayOf(14)).toBe('sun');
    for (let day = 1; day <= 5; day++) expect(isWeekend(weekdayOf(day))).toBe(false);
    expect(isWeekend('sat') && isWeekend('sun')).toBe(true);
  });

  it('Game 的今天與明日預報依天數循環', () => {
    const days = recordDays(emptyGame(1), 8);
    expect(days.map((d) => d.today.weekday)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'mon']);
    expect(days.map((d) => d.today.weekend)).toEqual([false, false, false, false, false, true, true, false]);
    expect(days.map((d) => d.today.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(days[4]!.forecast).toMatchObject({ day: 6, weekday: 'sat', weekend: true });
    expect(days[7]!.forecast).toMatchObject({ day: 9, weekday: 'tue', weekend: false });
  });
});

describe('天氣與明日預報', () => {
  it('第 1 天固定晴天、星期一，並已知第 2 天的預報', () => {
    for (const seed of [1, 2, 3, 42]) {
      const game = new Game({ seed });
      expect(game.today).toEqual({ day: 1, weather: 'sunny', weekday: 'mon', weekend: false });
      expect(game.forecast).toMatchObject({ day: 2, weekday: 'tue', weekend: false });
      expect(WEATHERS).toContain(game.forecast.weather);
    }
  });

  it('預報一定準確：進入下一天時，明天的天氣成為今天的天氣', () => {
    const days = recordDays(emptyGame(5), 20);
    for (let i = 1; i < days.length; i++) expect(days[i]!.today).toEqual(days[i - 1]!.forecast);
  });

  it('營業時段與每日結算時，今天與預報不變', () => {
    const game = new Game({ seed: 2 });
    const before = { today: game.today, forecast: game.forecast };
    runOpenHours(game);
    expect(game.phase).toBe('report');
    expect({ today: game.today, forecast: game.forecast }).toEqual(before);
  });

  it('同種子下天氣序列可重現', () => {
    const weathers = (seed: number) => recordDays(emptyGame(seed), 15).map((d) => d.today.weather);
    expect(weathers(7)).toEqual(weathers(7));
  });

  it('不同種子的天氣序列不同，且四種天氣都會出現', () => {
    const a = recordDays(emptyGame(1), 30).map((d) => d.today.weather);
    const b = recordDays(emptyGame(2), 30).map((d) => d.today.weather);
    expect(a).not.toEqual(b);
    expect(new Set([...a, ...b])).toEqual(new Set(WEATHERS));
  });

  it(`任何 30 天內同一種天氣不連續超過 ${MAX_WEATHER_STREAK} 天`, () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const days = recordDays(emptyGame(seed), 30);
      const weathers = [...days.map((d) => d.today.weather), days[days.length - 1]!.forecast.weather];
      expect(longestStreak(weathers), `seed ${seed}: ${weathers.join(',')}`).toBeLessThanOrEqual(MAX_WEATHER_STREAK);
    }
  });

  it(`已連續 ${MAX_WEATHER_STREAK} 天的天氣，下一天一定換掉；未達上限時仍可能延續`, () => {
    const rng = Rng.fromSeed(11);
    for (const w of WEATHERS) {
      const capped = Array.from({ length: 200 }, () => rollWeather(rng, w, MAX_WEATHER_STREAK));
      expect(capped).not.toContain(w);
      const open = Array.from({ length: 200 }, () => rollWeather(rng, w, MAX_WEATHER_STREAK - 1));
      expect(open).toContain(w);
    }
  });

  it('擲天氣不消耗主亂數流（顧客與狀況的亂數序列不變）', () => {
    expect(new Game({ seed: 3 }).rng.state).toBe(Rng.fromSeed(3).state);
  });
});
