import type { Game } from '../sim/game';
import { useGameVersion } from './hooks';
import { formatMoney } from './messages';

export function Hud({ game }: { game: Game }) {
  useGameVersion(game);
  return (
    <div className="hud">
      <span className="hud-title">便利商店模擬</span>
      <span className="hud-meta">
        第 1 天 · 準備階段 · 資金 <strong>{formatMoney(game.funds)}</strong>
      </span>
    </div>
  );
}
