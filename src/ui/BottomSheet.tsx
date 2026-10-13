import { useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { useLandscapePhone } from './media';

/** 往下（橫向時往右）拖超過這個距離就關閉 */
const DISMISS_DISTANCE = 80;

interface BottomSheetProps {
  /** 抽屜標題列的內容 */
  title: ReactNode;
  /** 無障礙名稱 */
  label: string;
  children: ReactNode;
  /** 提供時才能關閉：✕ 按鈕、下拉、點背景 */
  onClose?: () => void;
  /** 蓋一層背景擋住店面（狀況等必須先處理的情境） */
  modal?: boolean;
  /** half：約半個畫面（選取設施）；tall：約 85%（清單類） */
  size?: 'half' | 'tall';
  className?: string;
  sheetRef?: Ref<HTMLDivElement>;
}

/**
 * 手機版的面板：直向從底部滑出、橫向從右側滑出。
 * 不可關閉的抽屜（onClose 未提供）下拉與點背景都沒有作用。
 */
export function BottomSheet({ title, label, children, onClose, modal, size = 'half', className, sheetRef }: BottomSheetProps) {
  const landscape = useLandscapePhone();
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ id: number; start: number } | null>(null);

  const axis = (e: React.PointerEvent) => (landscape ? e.clientX : e.clientY);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!onClose || (e.target as HTMLElement).closest('button')) return;
    drag.current = { id: e.pointerId, start: axis(e) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    setOffset(Math.max(0, axis(e) - drag.current.start));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (offset > DISMISS_DISTANCE) onClose?.();
    setOffset(0);
  };

  const sheet = (
    <div
      ref={sheetRef}
      className={['sheet', `sheet-${size}`, className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal={modal || undefined}
      aria-label={label}
      style={offset ? { transform: landscape ? `translateX(${offset}px)` : `translateY(${offset}px)` } : undefined}
    >
      <header
        className="sheet-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {onClose && <span className="sheet-handle" aria-hidden="true" />}
        <div className="sheet-title">{title}</div>
        {onClose && (
          <button className="sheet-close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        )}
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );

  if (!modal) return sheet;
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      {sheet}
    </div>
  );
}
