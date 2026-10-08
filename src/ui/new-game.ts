import { clearSave } from '../persistence/save';

/** 清除存檔並重新載入，從第 1 天開始 */
export function startNewGame(): void {
  clearSave();
  window.location.reload();
}
