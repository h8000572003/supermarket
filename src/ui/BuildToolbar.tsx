import { FIXTURES, FIXTURE_KINDS } from '../sim/catalog/fixtures';
import { sellRefund } from '../sim/game';
import type { Controller } from './controller';
import { useGameVersion, useInteraction } from './hooks';
import { SlotPanel } from './SlotPanel';
import { formatMoney } from './messages';

export function BuildToolbar({ controller }: { controller: Controller }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool, selectedId, message } = useInteraction(interaction);
  const selected = selectedId ? game.fixture(selectedId) : undefined;

  return (
    <div className="toolbar-area">
      {message && <div className="toast">{message}</div>}

      {selected && tool.mode === 'select' && FIXTURES[selected.kind].slots > 0 && (
        <SlotPanel controller={controller} fixture={selected} />
      )}

      {selected && tool.mode === 'select' && (
        <div className="panel">
          <strong>{FIXTURES[selected.kind].name}</strong>
          <button onClick={() => controller.rotate()}>旋轉 (R)</button>
          <button onClick={() => controller.startMoving(selected.id)}>移動</button>
          <button className="danger" onClick={() => controller.sell(selected.id)}>
            出售 +{formatMoney(sellRefund(selected.kind))}
          </button>
        </div>
      )}

      <div className="toolbar">
        <button className={tool.mode === 'select' ? 'active' : ''} onClick={() => controller.cancel()}>
          選取
        </button>
        {FIXTURE_KINDS.map((kind) => {
          const def = FIXTURES[kind];
          const active = tool.mode === 'place' && !tool.movingId && tool.kind === kind;
          return (
            <button
              key={kind}
              className={active ? 'active' : ''}
              disabled={game.funds < def.price}
              onClick={() => controller.startPlacing(kind)}
            >
              {def.name}
              <small>{formatMoney(def.price)}</small>
            </button>
          );
        })}
        <span className="hint">
          {tool.mode === 'place' ? '左鍵放置 · R 旋轉 · 右鍵 / Esc 取消' : '點選設施以旋轉、移動或出售'}
        </span>
      </div>
    </div>
  );
}
