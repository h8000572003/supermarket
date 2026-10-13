import { FIXTURES, FIXTURE_KINDS } from '../sim/catalog/fixtures';
import { DAILY_WAGE, MAX_STAFF } from '../sim/game';
import type { Controller } from './controller';
import { useGameVersion, useInteraction } from './hooks';
import { DispatchPanel } from './DispatchPanel';
import { FixtureActions } from './FixtureSheet';
import { useNarrow } from './media';
import { SlotPanel } from './SlotPanel';
import { formatMoney } from './messages';

export function BuildToolbar({ controller }: { controller: Controller }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool, selectedId, message } = useInteraction(interaction);
  const narrow = useNarrow();
  // 手機版的設施面板改由 FixtureSheet 以抽屜呈現
  const selected = selectedId && !narrow ? game.fixture(selectedId) : undefined;

  if (game.phase !== 'prep') {
    const open = game.phase === 'open';
    return (
      <div className="toolbar-area">
        {message && <div className="toast">{message}</div>}
        {open && selected && (selected.kind === 'register' || FIXTURES[selected.kind].slots > 0) && (
          <DispatchPanel controller={controller} fixture={selected} />
        )}
        <div className="toolbar">
          <span className="hint">
            {open
              ? '營業中可限時特價、緊急叫貨（商品與進貨），或點選格位／收銀台「優先處理」派工；擺設與定價請在準備階段進行'
              : '目前只能觀察；擺設、進貨與定價請在準備階段進行'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar-area">
      {message && <div className="toast">{message}</div>}

      {selected && tool.mode === 'select' && FIXTURES[selected.kind].slots > 0 && (
        <SlotPanel controller={controller} fixture={selected} />
      )}

      {selected && tool.mode === 'select' && (
        <div className="panel">
          <strong>{FIXTURES[selected.kind].name}</strong>
          <FixtureActions controller={controller} fixture={selected} />
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
        <span className="divider" />
        <span className="staff-group">
          店員 {game.staff.length}/{MAX_STAFF}
          <small>日薪 {formatMoney(DAILY_WAGE)}/人</small>
        </span>
        <button onClick={() => controller.hire()} disabled={game.staff.length >= MAX_STAFF} aria-label="雇用店員">
          ＋
        </button>
        <button onClick={() => controller.fireLast()} disabled={game.staff.length === 0} aria-label="解雇店員">
          －
        </button>
      </div>
      {/* 提示放在工具列外，文字長短改變時按鈕位置不會跟著移動 */}
      <div className="toolbar-hint">
        {game.day === 1 && game.fixtures.length === 0 && tool.mode === 'select'
          ? '先放冷藏櫃、貨架與收銀台，指定格位商品、進貨、雇店員，再按「開店」'
          : tool.mode === 'place'
            ? '左鍵放置 · R 旋轉 · 右鍵 / Esc 取消'
            : '點選設施以旋轉、移動或出售'}
      </div>
    </div>
  );
}
