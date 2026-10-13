import { useState } from 'react';

interface StepperProps {
  value: number;
  /** 按 −／＋ 或輸入完成（離開欄位、按 Enter）時呼叫 */
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
  /** 無障礙名稱，例如「綠茶售價」 */
  label: string;
  /** value 為 0 時顯示的提示，例如「≥24」 */
  placeholder?: string;
}

/**
 * − 數值 ＋。中間的數值可以點開用數字鍵盤直接輸入；
 * 手機上不必先彈出全尺寸鍵盤就能調整。
 */
export function Stepper({ value, onChange, step = 1, min = 0, disabled, label, placeholder }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onChange(Math.max(min, n));
  };

  return (
    <span className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={disabled || value <= min}
        aria-label={`${label}減少`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft ?? (value === 0 && placeholder ? '' : String(value))}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button type="button" onClick={() => onChange(value + step)} disabled={disabled} aria-label={`${label}增加`}>
        ＋
      </button>
    </span>
  );
}
