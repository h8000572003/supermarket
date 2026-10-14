import { startNewGame } from './new-game';

/** 存檔無法讀取時的提示（ADR 0006）；存檔保留不動，玩家確認後才開新遊戲並覆蓋 */
export function UnreadableSaveDialog() {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="存檔無法讀取">
        <h2>存檔無法讀取</h2>
        <p>
          這份存檔可能來自更新版本的遊戲，或已經損毀。存檔目前保留原樣，沒有被刪除；更新遊戲後可能就能讀取。
        </p>
        <p>開新遊戲會覆蓋這份存檔。</p>
        <div className="incident-options">
          <button className="primary" onClick={() => window.confirm('確定要覆蓋無法讀取的存檔、從第 1 天開始嗎？') && startNewGame()}>
            <strong>開新遊戲</strong>
            <small>覆蓋無法讀取的存檔</small>
          </button>
        </div>
      </div>
    </div>
  );
}
