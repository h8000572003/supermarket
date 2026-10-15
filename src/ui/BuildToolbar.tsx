import { useEffect, useState } from 'react';
import { FIXTURES, FIXTURE_KINDS } from '../sim/catalog/fixtures';
import type { FixtureKind } from '../sim/catalog/fixtures';
import { DAILY_WAGE, MAX_STAFF } from '../sim/game';
import { BottomSheet } from './BottomSheet';
import type { Controller } from './controller';
import { useGameVersion, useInteraction } from './hooks';
import { DispatchPanel } from './DispatchPanel';
import { FixtureActions } from './FixtureSheet';
import { useNarrow, usePointerCoarse } from './media';
import { SlotPanel } from './SlotPanel';
import { formatMoney } from './messages';

/** 提示訊息顯示的時間 */
const TOAST_MS = 3000;

interface ToolbarProps {
  controller: Controller;
  onOpenStock: () => void;
}

export function BuildToolbar(props: ToolbarProps) {
  return (
    <div className="toolbar-area">
      <Toast controller={props.controller} />
      {useNarrow() ? <CompactToolbar {...props} /> : <WideToolbar {...props} />}
    </div>
  );
}

/** 操作回饋：固定在工具列上方，幾秒後自動消失；錯誤為紅色 */
function Toast({ controller }: { controller: Controller }) {
  const { interaction } = controller;
  const { message, messageKind, messageSeq } = useInteraction(interaction);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      // 期間若已換成新訊息就不清掉
      if (interaction.state.messageSeq === messageSeq) interaction.update({ message: null });
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [interaction, message, messageSeq]);
  if (!message) return null;
  return (
    <div key={messageSeq} className={`toast toast-${messageKind}`} role={messageKind === 'error' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}

/** 手機版工具列的簡短名稱 */
const SHORT_NAME: Record<FixtureKind, string> = { shelf: '貨架', fridge: '冷藏櫃', register: '收銀台' };

/**
 * 手機版：一排按鈕。準備階段為選取、三種設施、商品與進貨、店員；
 * 營業中只有商品與進貨與派工說明。店員的雇用與解雇在抽屜裡。
 */
function CompactToolbar({ controller, onOpenStock }: ToolbarProps) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool } = useInteraction(interaction);
  const coarse = usePointerCoarse();
  const [staffOpen, setStaffOpen] = useState(false);
  const pending = game.pendingOrders.length;
  const prep = game.phase === 'prep';

  const stockButton = (
    <button className="with-badge" onClick={onOpenStock} aria-label={`商品與進貨，在途 ${pending} 張`}>
      商品
      <small>進貨</small>
      {pending > 0 && <span className="badge">{pending}</span>}
    </button>
  );

  let hint: string;
  if (!prep) hint = game.phase === 'open' ? '點格位或收銀台可派工、換貨 · 擺設請在準備階段' : '擺設與進貨請在準備階段進行';
  else if (game.day === 1 && game.fixtures.length === 0 && tool.mode === 'select') hint = '先放設施、指定商品、進貨、雇店員，再按「開店」';
  else if (tool.mode === 'place') hint = coarse ? '點地板移動預覽，再按 ✓ 放置' : '左鍵放置 · R 旋轉 · 右鍵 / Esc 取消';
  else hint = '點設施以旋轉、移動或出售';

  return (
    <>
      <div className="toolbar-hint">{hint}</div>
      <div className="toolbar toolbar-compact">
        {prep && (
          <>
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
                  aria-label={`${def.name} ${formatMoney(def.price)}`}
                >
                  {SHORT_NAME[kind]}
                  <small>{formatMoney(def.price)}</small>
                </button>
              );
            })}
          </>
        )}
        {(prep || game.phase === 'open') && stockButton}
        {prep && (
          <button onClick={() => setStaffOpen(true)} aria-label={`店員 ${game.staff.length} 人`}>
            店員
            <small>
              {game.staff.length}/{MAX_STAFF}
            </small>
          </button>
        )}
      </div>
      {prep && staffOpen && (
        <BottomSheet label="店員" title={<h2>店員</h2>} onClose={() => setStaffOpen(false)} className="staff-sheet">
          <p className="staff-summary">
            目前 <strong>{game.staff.length}</strong> / {MAX_STAFF} 人 · 日薪 {formatMoney(DAILY_WAGE)}/人 · 每日合計{' '}
            {formatMoney(DAILY_WAGE * game.staff.length)}
          </p>
          <div className="sheet-actions sheet-actions-2">
            <button onClick={() => controller.hire()} disabled={game.staff.length >= MAX_STAFF}>
              ＋ 雇用
            </button>
            <button className="danger" onClick={() => controller.fireLast()} disabled={game.staff.length === 0}>
              － 解雇
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function WideToolbar({ controller }: ToolbarProps) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool, selectedId } = useInteraction(interaction);
  const coarse = usePointerCoarse();
  const selected = selectedId ? game.fixture(selectedId) : undefined;

  if (game.phase !== 'prep') {
    const open = game.phase === 'open';
    return (
      <>
        {open && selected && (selected.kind === 'register' || FIXTURES[selected.kind].slots > 0) && (
          <DispatchPanel controller={controller} fixture={selected} />
        )}
        {/* 營業中也能更換格位商品（換貨，ADR 0004） */}
        {open && selected && FIXTURES[selected.kind].slots > 0 && <SlotPanel controller={controller} fixture={selected} />}
        <div className="toolbar">
          <span className="hint">
            {open
              ? '營業中可限時特價、緊急叫貨（商品與進貨），點選格位／收銀台「優先處理」派工、點店裡的麻煩（垃圾等）派店員處理，或更換格位商品（店員下架後換上）；擺設與定價請在準備階段進行'
              : '目前只能觀察；擺設、進貨與定價請在準備階段進行'}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
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
          ? '先放冷藏櫃、貨架與收銀台，指定格位商品、進貨（開店時送達）、雇店員，再按「開店」'
          : tool.mode === 'place'
            ? coarse
              ? '點地板移動預覽，再按 ✓ 放置'
              : '左鍵放置 · R 旋轉 · 右鍵 / Esc 取消'
            : '點選設施以旋轉、移動或出售'}
      </div>
    </>
  );
}
