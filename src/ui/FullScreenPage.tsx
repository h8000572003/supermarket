import type { ReactNode } from 'react';

interface FullScreenPageProps {
  title: ReactNode;
  /** 提供時左上角顯示返回鍵 */
  onBack?: () => void;
  /** 標題列下方、不跟著捲動的區塊（例如分頁） */
  tabs?: ReactNode;
  /** 固定在底部的操作列 */
  footer?: ReactNode;
  children: ReactNode;
  label?: string;
}

/** 手機版：蓋住整個畫面的頁面；內容捲動，標題列與底部操作列固定 */
export function FullScreenPage({ title, onBack, tabs, footer, children, label }: FullScreenPageProps) {
  return (
    <div className="page" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <header className="page-header">
        {onBack && (
          <button className="page-back" onClick={onBack} aria-label="返回">
            ‹
          </button>
        )}
        <h2>{title}</h2>
      </header>
      {tabs}
      <div className="page-body">{children}</div>
      {footer && <footer className="page-footer">{footer}</footer>}
    </div>
  );
}
