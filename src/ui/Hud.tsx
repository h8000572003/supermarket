import type { Game } from '../sim/game';
import { useGameVersion } from './hooks';
import { formatMoney } from './messages';

interface HudProps {
  game: Game;
  onOpenStock: () => void;
}

export function Hud({ game, onOpenStock }: HudProps) {
  useGameVersion(game);
  const pending = game.pendingOrders.length;
  return (
    <div className="hud">
      <span className="hud-title">便利商店模擬</span>
      <span className="hud-actions">
        <button onClick={onOpenStock}>商品與進貨{pending > 0 ? `（在途 ${pending} 張）` : ''}</button>
        {/* 暫時：M3 時鐘完成前，用來推進到下一個營業日 */}
        <button onClick={() => game.advanceDay()}>下一天（暫時）</button>
      </span>
      <span className="hud-meta">
        第 {game.day} 天 · 準備階段 · 資金 <strong>{formatMoney(game.funds)}</strong>
      </span>
    </div>
  );
}
