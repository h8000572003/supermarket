import { SPEEDS } from '../sim/clock/clock';
import type { Speed } from '../sim/clock/clock';
import { useState, useSyncExternalStore } from 'react';
import type { SoundBoard } from '../audio/sounds';
import type { Phase } from '../sim/game';
import type { Controller } from './controller';
import { useGameVersion } from './hooks';
import { useNarrow } from './media';
import { startNewGame } from './new-game';
import { formatMoney, formatTime } from './messages';

const PHASE_LABEL: Record<Phase, string> = {
  prep: '準備階段',
  open: '營業中',
  report: '每日結算',
  gameover: '已破產',
};

const SPEED_LABEL: Record<Speed, string> = { 0: '⏸', 1: '1x', 2: '2x', 4: '4x' };

interface HudProps {
  controller: Controller;
  sounds: SoundBoard;
  onOpenStock: () => void;
  onOpenMilestones: () => void;
}

export function Hud(props: HudProps) {
  return useNarrow() ? <CompactHud {...props} /> : <WideHud {...props} />;
}

function useOpenStore(controller: Controller) {
  const { game, interaction } = controller;
  return () => {
    const r = game.openStore();
    if (r.ok) interaction.update({ tool: { mode: 'select' }, selectedId: null, message: null });
    else controller.showError(r.error);
  };
}

const confirmNewGame = () => {
  if (window.confirm('確定要放棄目前的店、從第 1 天重新開始嗎？')) startNewGame();
};

/**
 * 手機版：一條狀態列（天數、時間、資金）＋主要按鈕（開店或倍速）＋「⋯」選單。
 * 點狀態列展開口碑與營業數字；「商品與進貨」移到底部工具列。
 */
function CompactHud({ controller, sounds, onOpenMilestones }: HudProps) {
  const { game } = controller;
  useGameVersion(game);
  const muted = useSyncExternalStore(
    (l) => sounds.subscribe(l),
    () => sounds.muted,
  );
  const openStore = useOpenStore(controller);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 暫停後按 ▶ 回到暫停前的倍速
  const [resumeSpeed, setResumeSpeed] = useState<Speed>(1);
  const paused = game.speed === 0;
  const running: readonly Speed[] = SPEEDS.filter((sp) => sp !== 0);
  const nextSpeed = running[(running.indexOf(game.speed) + 1) % running.length] ?? 1;

  const menu = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="hud hud-compact">
      <button
        className="hud-status"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label="店舖狀態，點一下展開詳細資訊"
      >
        <span>第 {game.day} 天</span>
        <span className="clock">{formatTime(game.minuteOfDay)}</span>
        <strong className={game.funds < 0 ? 'negative' : ''}>{formatMoney(game.funds)}</strong>
      </button>
      <span className="hud-primary">
        {game.phase === 'prep' && (
          <button className="primary" onClick={openStore}>
            開店
          </button>
        )}
        {game.phase === 'open' && (
          <>
            <button
              onClick={() => {
                if (paused) game.setSpeed(resumeSpeed);
                else {
                  setResumeSpeed(game.speed);
                  game.setSpeed(0);
                }
              }}
              aria-label={paused ? '繼續' : '暫停'}
              className={paused ? 'active' : ''}
            >
              {paused ? '▶' : '⏸'}
            </button>
            <button onClick={() => game.setSpeed(paused ? resumeSpeed : nextSpeed)} aria-label="切換倍速">
              {SPEED_LABEL[paused ? resumeSpeed : game.speed]}
            </button>
          </>
        )}
        <button onClick={() => setMenuOpen((v) => !v)} aria-label="更多" aria-expanded={menuOpen}>
          ⋯
        </button>
      </span>
      {expanded && (
        <div className="hud-details" role="status">
          <span>{PHASE_LABEL[game.phase]}</span>
          <span>口碑 {Math.round(game.reputation)}</span>
          {game.phase === 'open' && (
            <>
              <span>店內 {game.customerAgents.length} 人</span>
              <span>今日營收 {formatMoney(game.todayRevenue)}</span>
            </>
          )}
        </div>
      )}
      {menuOpen && (
        <div className="more-menu" role="menu">
          <button role="menuitem" onClick={menu(onOpenMilestones)}>
            經營目標
          </button>
          <button role="menuitem" onClick={menu(() => sounds.setMuted(!muted))}>
            {muted ? '🔇 開啟音效' : '🔊 關閉音效'}
          </button>
          {game.phase === 'prep' && (
            <button role="menuitem" className="danger" onClick={menu(confirmNewGame)}>
              新遊戲
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WideHud({ controller, sounds, onOpenStock, onOpenMilestones }: HudProps) {
  const { game } = controller;
  useGameVersion(game);
  const muted = useSyncExternalStore(
    (l) => sounds.subscribe(l),
    () => sounds.muted,
  );
  const pending = game.pendingOrders.length;
  const openStore = useOpenStore(controller);

  return (
    <div className="hud">
      <span className="hud-title">便利商店模擬</span>
      <span className="hud-actions">
        <button className="with-badge" onClick={onOpenStock} aria-label={`商品與進貨，在途 ${pending} 張`}>
          商品與進貨
          {pending > 0 && <span className="badge">{pending}</span>}
        </button>
        <button onClick={onOpenMilestones}>目標</button>
        <button onClick={() => sounds.setMuted(!muted)} aria-label={muted ? '開啟音效' : '關閉音效'}>
          {muted ? '🔇' : '🔊'}
        </button>
        {game.phase === 'prep' && (
          <button onClick={confirmNewGame}>新遊戲</button>
        )}
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
