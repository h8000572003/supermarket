import { useSyncExternalStore } from 'react';

/** 版面：窄螢幕或矮螢幕（直向、橫向手機）改用狀態列、抽屜與卡片；與 styles.css 的斷點一致 */
export const NARROW_QUERY = '(max-width: 720px), (max-height: 520px)';
/** 操作：主要指標是手指，放置設施改為「預覽、確認」 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';
/** 橫向手機：工具列與抽屜改放右側 */
export const LANDSCAPE_PHONE_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** 非瀏覽器環境（測試）一律視為不符合 */
export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    },
    () => matches(query),
  );
}

export const useNarrow = () => useMediaQuery(NARROW_QUERY);
export const usePointerCoarse = () => useMediaQuery(COARSE_POINTER_QUERY);
export const useLandscapePhone = () => useMediaQuery(LANDSCAPE_PHONE_QUERY);
