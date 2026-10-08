import { useEffect, useRef } from 'react';
import { createStoreScene } from './render/scene';
import type { StoreScene } from './render/scene';
import { BuildToolbar } from './ui/BuildToolbar';
import type { Controller } from './ui/controller';
import { Hud } from './ui/Hud';

export function App({ controller }: { controller: Controller }) {
  const hostRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') controller.rotate();
      else if (e.key === 'Escape') controller.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  return (
    <>
      <div ref={hostRef} className="stage" />
      <Hud game={controller.game} />
      <BuildToolbar controller={controller} />
    </>
  );
}
