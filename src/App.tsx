import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SoundBoard } from './audio/sounds';
import { createStoreScene } from './render/scene';
import type { StoreScene } from './render/scene';
import { BuildToolbar } from './ui/BuildToolbar';
import { DailyReportPanel } from './ui/DailyReportPanel';
import { FixtureSheet } from './ui/FixtureSheet';
import type { Controller } from './ui/controller';
import { Hud } from './ui/Hud';
import { IncidentDialog } from './ui/IncidentDialog';
import { MilestonesPanel } from './ui/MilestonesPanel';
import { StockPanel } from './ui/StockPanel';
import { useNarrow, usePointerCoarse } from './ui/media';
import { PlacementBar } from './ui/PlacementBar';
import { formatMoney } from './ui/messages';
import { productById } from './sim/catalog/products';

export function App({ controller, sounds }: { controller: Controller; sounds: SoundBoard }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<'stock' | 'milestones' | null>(null);
  const [scene, setScene] = useState<StoreScene | null>(null);
  const narrow = useNarrow();
  const coarse = usePointerCoarse();
  // 觸控裝置：放置設施改為「預覽、確認」
  useEffect(() => {
    controller.confirmPlacementMode = coarse;
  }, [controller, coarse]);
  const toggle = (p: 'stock' | 'milestones') => setPanel((cur) => (cur === p ? null : p));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: StoreScene | null = null;
    let disposed = false;
    // StrictMode 會先卸載再掛載：init 為非同步，需處理卸載早於 init 完成的情況
    void createStoreScene(host, controller).then((s) => {
      if (disposed) s.destroy();
      else {
        scene = s;
        setScene(s);
        if (import.meta.env.DEV) Object.assign(window, { __scene: s });
      }
    });
    return () => {
      disposed = true;
      scene?.destroy();
      setScene(null);
    };
  }, [controller]);

  // 模擬迴圈：把每幀的現實時間交給 Game，由它依倍速換算成固定步數
  useEffect(() => {
    let last = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      controller.game.tick(now - last);
      last = now;
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [controller]);

  // 限時特價到期時提示店長（售價已恢復）
  useEffect(
    () =>
      controller.game.onEvent((e) => {
        if (e.type !== 'flash-sale-ended') return;
        const product = productById(e.productId);
        const price = controller.game.salePrice(e.productId);
        controller.interaction.update({
          message: `限時特價結束：${product?.name ?? e.productId} 恢復售價 ${formatMoney(price ?? 0)}`,
          messageKind: 'info',
        });
      }),
    [controller],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'r' || e.key === 'R') controller.rotate();
      else if (e.key === 'Escape') controller.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  return (
    <>
      <div ref={hostRef} className="stage" />
      {scene && <ViewReset scene={scene} />}
      <Hud
        controller={controller}
        sounds={sounds}
        onOpenStock={() => toggle('stock')}
        onOpenMilestones={() => toggle('milestones')}
      />
      <BuildToolbar controller={controller} onOpenStock={() => toggle('stock')} />
      {narrow && <FixtureSheet controller={controller} scene={scene} />}
      {coarse && scene && <PlacementBar controller={controller} scene={scene} />}
      {panel === 'stock' && <StockPanel controller={controller} onClose={() => setPanel(null)} />}
      {panel === 'milestones' && <MilestonesPanel game={controller.game} onClose={() => setPanel(null)} />}
      <IncidentDialog controller={controller} />
      <DailyReportPanel game={controller.game} />
    </>
  );
}

/** 縮放或平移過鏡頭時，出現「重設視角」 */
function ViewReset({ scene }: { scene: StoreScene }) {
  const isDefault = useSyncExternalStore(
    (l) => scene.subscribeView(l),
    () => scene.viewIsDefault,
  );
  if (isDefault) return null;
  return (
    <button className="view-reset" onClick={() => scene.resetView()} aria-label="重設視角" title="重設視角">
      ⌖
    </button>
  );
}
