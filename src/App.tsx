import { useEffect, useRef, useState } from 'react';
import type { SoundBoard } from './audio/sounds';
import { createStoreScene } from './render/scene';
import type { StoreScene } from './render/scene';
import { BuildToolbar } from './ui/BuildToolbar';
import { DailyReportPanel } from './ui/DailyReportPanel';
import type { Controller } from './ui/controller';
import { Hud } from './ui/Hud';
import { MilestonesPanel } from './ui/MilestonesPanel';
import { StockPanel } from './ui/StockPanel';

export function App({ controller, sounds }: { controller: Controller; sounds: SoundBoard }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<'stock' | 'milestones' | null>(null);
  const toggle = (p: 'stock' | 'milestones') => setPanel((cur) => (cur === p ? null : p));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: StoreScene | null = null;
    let disposed = false;
    // StrictMode 會先卸載再掛載：init 為非同步，需處理卸載早於 init 完成的情況
    void createStoreScene(host, controller).then((s) => {
      if (disposed) s.destroy();
      else scene = s;
    });
    return () => {
      disposed = true;
      scene?.destroy();
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
      <Hud
        controller={controller}
        sounds={sounds}
        onOpenStock={() => toggle('stock')}
        onOpenMilestones={() => toggle('milestones')}
      />
      <BuildToolbar controller={controller} />
      {panel === 'stock' && <StockPanel controller={controller} onClose={() => setPanel(null)} />}
      {panel === 'milestones' && <MilestonesPanel game={controller.game} onClose={() => setPanel(null)} />}
      <DailyReportPanel game={controller.game} />
    </>
  );
}
