import { describe, expect, it } from 'vitest';
import { emptyNuisanceSummary } from '../sim/nuisances/nuisances';
import { formatNuisances } from './messages';

describe('每日結算的麻煩摘要', () => {
  it('沒有麻煩時為空字串', () => {
    expect(formatNuisances(emptyNuisanceSummary())).toBe('');
  });

  it('列出出現數（只列出現過的種類）、處理數與累計在場時間', () => {
    const summary = {
      byKind: { litter: { appeared: 3, handled: 2 }, rat: { appeared: 1, handled: 1 }, troublemaker: { appeared: 0, handled: 0 } },
      minutes: 95,
    };
    expect(formatNuisances(summary)).toBe(
      '出現 4 個（垃圾 3、老鼠 1），處理 3 個，累計在場 1 小時 35 分。在場越久，來客越少、顧客越不滿意。',
    );
  });
});
