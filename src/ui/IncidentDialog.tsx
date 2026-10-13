import { optionGoods } from '../sim/incidents/incidents';
import type { Controller } from './controller';
import { BottomSheet } from './BottomSheet';
import { useGameVersion } from './hooks';
import { useNarrow } from './media';
import { formatMoney, formatTime } from './messages';

/** 營業時段中發生狀況時的對話框；等待選擇時 Game 自己停住時間，選完以原本的速度繼續 */
export function IncidentDialog({ controller }: { controller: Controller }) {
  const { game } = controller;
  useGameVersion(game);
  const narrow = useNarrow();
  const incident = game.phase === 'open' ? game.pendingIncident : null;
  if (!incident) return null;

  const choose = (option: number) => {
    const r = game.resolveIncident(option);
    if (!r.ok) controller.showError(r.error);
  };

  const title = (
    <h2>
      <span className="clock">{formatTime(incident.minute)}</span> {incident.name}
    </h2>
  );
  const body = (
    <>
      <p>{incident.description}</p>
      <div className="incident-options">
        {incident.options.map((o, i) => (
          <button key={o.label} className={i === 0 ? 'primary' : ''} disabled={!o.available} onClick={() => choose(i)}>
            <strong>
              {o.label} · {o.cost > 0 ? formatMoney(o.cost) : '免費'}
            </strong>
            <small>{o.available ? o.detail : `資金不足（需要 ${formatMoney(o.cost)}）`}</small>
            {o.available && optionGoods(o) > 0 && <small>費用為商品金額，計入進貨成本</small>}
          </button>
        ))}
      </div>
    </>
  );

  // 手機版：不能關閉的底部抽屜；一定要選一個選項遊戲才會繼續
  if (narrow) {
    return (
      <BottomSheet title={title} label={`狀況：${incident.name}`} modal size="tall" className="incident-sheet">
        {body}
      </BottomSheet>
    );
  }
  return (
    <div className="modal-backdrop">
      <div className="modal incident-modal" role="dialog" aria-modal="true" aria-label={`狀況：${incident.name}`}>
        {title}
        {body}
      </div>
    </div>
  );
}
