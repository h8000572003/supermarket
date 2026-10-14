import { useLayoutEffect, useRef } from 'react';
import type { StoreScene } from '../render/scene';
import { FIXTURES } from '../sim/catalog/fixtures';
import { sellRefund } from '../sim/game';
import type { Fixture } from '../sim/store/store-layout';
import { BottomSheet } from './BottomSheet';
import type { Controller } from './controller';
import { DispatchPanel } from './DispatchPanel';
import { useGameVersion, useInteraction } from './hooks';
import { useLandscapePhone, usePointerCoarse } from './media';
import { formatMoney } from './messages';
import { SlotPanel } from './SlotPanel';

/** 準備階段選取設施時的操作：旋轉、移動、出售 */
export function FixtureActions({ controller, fixture }: { controller: Controller; fixture: Fixture }) {
  const coarse = usePointerCoarse();
  return (
    <>
      <button onClick={() => controller.rotate()}>{coarse ? '旋轉' : '旋轉 (R)'}</button>
      <button onClick={() => controller.startMoving(fixture.id)}>移動</button>
      <button className="danger" onClick={() => controller.sell(fixture.id)}>
        出售 +{formatMoney(sellRefund(fixture.kind))}
      </button>
    </>
  );
}

/** 手機版：選取設施後從底部（橫向時右側）打開的抽屜 */
export function FixtureSheet({ controller, scene }: { controller: Controller; scene: StoreScene | null }) {
  const { game, interaction } = controller;
  useGameVersion(game);
  const { tool, selectedId } = useInteraction(interaction);
  const landscape = useLandscapePhone();
  const sheetRef = useRef<HTMLDivElement>(null);
  const selected = selectedId ? game.fixture(selectedId) : undefined;
  const show =
    selected &&
    tool.mode === 'select' &&
    (game.phase === 'prep' || (game.phase === 'open' && (selected.kind === 'register' || FIXTURES[selected.kind].slots > 0)));

  // 抽屜打開時讓被選取的設施露在抽屜外
  useLayoutEffect(() => {
    if (!show || !selectedId || !scene || !sheetRef.current) return;
    // 用版面尺寸而非 getBoundingClientRect：滑入動畫開始時抽屜還在畫面外
    const { offsetWidth, offsetHeight } = sheetRef.current;
    const margin = 24;
    scene.revealFixture(selectedId, {
      top: 96,
      left: margin,
      bottom: window.innerHeight - margin - (landscape ? 0 : offsetHeight),
      right: window.innerWidth - margin - (landscape ? offsetWidth : 0),
    });
  }, [show, selectedId, scene, landscape]);

  if (!show || !selected) return null;
  const def = FIXTURES[selected.kind];
  return (
    <BottomSheet
      sheetRef={sheetRef}
      label={`${def.name}設定`}
      title={<strong>{def.name}</strong>}
      onClose={() => controller.select(null)}
      className="fixture-sheet"
    >
      {game.phase === 'prep' ? (
        <>
          <div className="sheet-actions">
            <FixtureActions controller={controller} fixture={selected} />
          </div>
          {def.slots > 0 && <SlotPanel controller={controller} fixture={selected} />}
        </>
      ) : (
        <>
          <DispatchPanel controller={controller} fixture={selected} showName={false} />
          {/* 營業中也能更換格位商品（換貨，ADR 0004） */}
          {def.slots > 0 && <SlotPanel controller={controller} fixture={selected} />}
        </>
      )}
    </BottomSheet>
  );
}
