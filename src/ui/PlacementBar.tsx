import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { StoreScene } from '../render/scene';
import { FIXTURES } from '../sim/catalog/fixtures';
import { footprint } from '../sim/store/geometry';
import type { Controller } from './controller';
import { useGameVersion, useInteraction } from './hooks';
import { LANDSCAPE_PHONE_QUERY, matches } from './media';
import { ERROR_MESSAGES, formatMoney } from './messages';

/** 浮動按鈕與畫面邊緣、預覽之間的距離 */
const GAP = 12;

/** 觸控放置：跟在預覽設施旁的「✓ 放置／⟳ 旋轉／✕ 取消」 */
export function PlacementBar({ controller, scene }: { controller: Controller; scene: StoreScene }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool, hover } = useInteraction(interaction);
  // 鏡頭移動時重新定位
  useSyncExternalStore(
    (l) => scene.subscribeView(l),
    () => scene.viewVersion,
  );
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const placing = tool.mode === 'place' && hover ? tool : null;
  const placement = placing && hover ? { origin: hover, facing: placing.facing } : null;
  const fp = placing && placement ? footprint(FIXTURES[placing.kind], placement) : null;
  const anchor = fp ? scene.gridToClient({ x: fp.origin.x + fp.spanX, y: fp.origin.y + fp.spanY }) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) return setPos(null);
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = Math.min(window.innerWidth - w - GAP, Math.max(GAP, anchor.x - w / 2));
    // 預設在預覽下方；太靠下（直向時會壓到底部工具列）時改到上方
    const bottomLimit = window.innerHeight - (matches(LANDSCAPE_PHONE_QUERY) ? GAP : 140);
    const below = anchor.y + GAP;
    const top = below + h > bottomLimit ? anchor.y - h - 120 : below;
    setPos({ left, top: Math.max(64, top) });
  }, [anchor?.x, anchor?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!placing || !placement) return null;
  const error = game.checkPlacement(placing.kind, placement, placing.movingId);
  const def = FIXTURES[placing.kind];

  return (
    <div
      ref={ref}
      className="placement-bar"
      role="toolbar"
      aria-label="放置設施"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
    >
      <div className="placement-buttons">
        <button className="primary" disabled={error !== null} onClick={() => controller.confirmPlacement()}>
          ✓ {placing.movingId ? '移到這裡' : `放置 ${formatMoney(def.price)}`}
        </button>
        <button onClick={() => controller.rotate()} aria-label="旋轉">
          ⟳
        </button>
        <button onClick={() => controller.cancel()} aria-label="取消">
          ✕
        </button>
      </div>
      {error && <small className="placement-error">{ERROR_MESSAGES[error]}</small>}
    </div>
  );
}
