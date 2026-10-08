import { SPEEDS } from '../sim/clock/clock';
import type { Speed } from '../sim/clock/clock';
import type { Game, Phase } from '../sim/game';
import { useGameVersion } from './hooks';
import { ERROR_MESSAGES, formatMoney, formatTime } from './messages';
import type { Interaction } from './interaction';

const PHASE_LABEL: Record<Phase, string> = {
  prep: '準備階段',
  open: '營業中',
  report: '每日結算',
  gameover: '已破產',
};

const SPEED_LABEL: Record<Speed, string> = { 0: '⏸', 1: '1x', 2: '2x', 4: '4x' };

interface HudProps {
  game: Game;
  interaction: Interaction;
  onOpenStock: () => void;
  onOpenMilestones: () => void;
}

export function Hud({ game, interaction, onOpenStock, onOpenMilestones }: HudProps) {
  useGameVersion(game);
  const pending = game.pendingOrders.length;

  const openStore = () => {
    const r = game.openStore();
    interaction.update(r.ok ? { tool: { mode: 'select' }, selectedId: null, message: null } : { message: ERROR_MESSAGES[r.error] });
  };

  return (
    <div className="hud">
      <span className="hud-title">便利商店模擬</span>
      <span className="hud-actions">
        <button onClick={onOpenStock}>商品與進貨{pending > 0 ? `（在途 ${pending} 張）` : ''}</button>
        <button onClick={onOpenMilestones}>目標</button>
        {game.phase === 'prep' && (
          <button className="primary" onClick={openStore}>
            開店
          </button>
        )}
        {game.phase === 'open' && (
          <span className="speed-group" role="group" aria-label="倍速">
            {SPEEDS.map((s) => (
              <button key={s} className={game.speed === s ? 'active' : ''} onClick={() => game.setSpeed(s)}>
                {SPEED_LABEL[s]}
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="hud-meta">
        第 {game.day} 天 · {PHASE_LABEL[game.phase]} · <span className="clock">{formatTime(game.minuteOfDay)}</span>
        {game.phase === 'open' && (
          <>
            {' '}
            · 店內 {game.customerAgents.length} 人 · 今日營收 {formatMoney(game.todayRevenue)}
          </>
        )}{' '}
        · 口碑 {Math.round(game.reputation)} · 資金{' '}
        <strong className={game.funds < 0 ? 'negative' : ''}>{formatMoney(game.funds)}</strong>
      </span>
    </div>
  );
}
