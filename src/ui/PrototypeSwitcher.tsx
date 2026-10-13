/**
 * PROTOTYPE（拋棄式）：底部浮動的變體切換列，← → 也能切換。只在開發模式顯示。
 * 切換時更新網址的 ?variant= 並通知場景重畫。
 */
import { useEffect, useState } from 'react';

export const VARIANT_EVENT = 'prototype-variant-change';

export function PrototypeSwitcher({ variants, names }: { variants: readonly string[]; names: Record<string, string> }) {
  const read = () => {
    const v = new URLSearchParams(window.location.search).get('variant');
    return v && variants.includes(v) ? v : variants[0]!;
  };
  const [current, setCurrent] = useState(read);

  useEffect(() => {
    const step = (delta: number) => {
      const i = variants.indexOf(read());
      const next = variants[(i + delta + variants.length) % variants.length]!;
      const url = new URL(window.location.href);
      url.searchParams.set('variant', next);
      window.history.replaceState(null, '', url);
      setCurrent(next);
      window.dispatchEvent(new Event(VARIANT_EVENT));
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    (window as unknown as { __variantStep: (d: number) => void }).__variantStep = step;
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  if (!import.meta.env.DEV) return null;
  const step = (d: number) => (window as unknown as { __variantStep: (d: number) => void }).__variantStep(d);
  return (
    <div className="prototype-switcher">
      <button onClick={() => step(-1)} aria-label="上一個變體">
        ←
      </button>
      <span>
        PROTOTYPE {current}（{names[current]}）
      </span>
      <button onClick={() => step(1)} aria-label="下一個變體">
        →
      </button>
    </div>
  );
}
