import { describe, expect, it } from 'vitest';
import { Game } from '../sim/game';
import { Controller } from './controller';
import { Interaction } from './interaction';

function setup(confirm: boolean) {
  const game = new Game({ seed: 1 });
  const controller = new Controller(game, new Interaction());
  controller.confirmPlacementMode = confirm;
  return { game, controller, interaction: controller.interaction };
}

describe('放置設施', () => {
  it('滑鼠模式：點地板直接放下並扣款', () => {
    const { game, controller } = setup(false);
    const funds = game.funds;
    controller.startPlacing('shelf');
    controller.click({ x: 4, y: 4 });
    expect(game.fixtures).toHaveLength(1);
    expect(game.funds).toBeLessThan(funds);
  });

  it('觸控模式：點地板只移動預覽，不放置也不扣款', () => {
    const { game, controller, interaction } = setup(true);
    const funds = game.funds;
    controller.startPlacing('shelf');
    expect(interaction.state.hover).not.toBeNull();
    controller.click({ x: 4, y: 4 });
    expect(game.fixtures).toHaveLength(0);
    expect(game.funds).toBe(funds);
    expect(interaction.state.hover).toEqual({ x: 4, y: 4 });
  });

  it('觸控模式：確認後在預覽位置放下並扣款', () => {
    const { game, controller } = setup(true);
    const funds = game.funds;
    controller.startPlacing('shelf');
    controller.click({ x: 4, y: 4 });
    controller.confirmPlacement();
    expect(game.fixtures).toHaveLength(1);
    expect(game.fixtures[0]?.origin).toEqual({ x: 4, y: 4 });
    expect(game.funds).toBeLessThan(funds);
  });

  it('觸控模式：預覽位置不可放時確認被拒絕並顯示原因', () => {
    const { game, controller, interaction } = setup(true);
    controller.startPlacing('shelf');
    controller.click({ x: 4, y: 4 });
    controller.confirmPlacement();
    // 同一格再放一次會重疊
    controller.confirmPlacement();
    expect(game.fixtures).toHaveLength(1);
    expect(interaction.state.message).not.toBeNull();
  });

  it('觸控模式：移動設施要確認；取消時留在原位', () => {
    const { game, controller, interaction } = setup(true);
    controller.startPlacing('shelf');
    controller.click({ x: 4, y: 4 });
    controller.confirmPlacement();
    const id = game.fixtures[0]!.id;

    controller.startMoving(id);
    expect(interaction.state.hover).toEqual({ x: 4, y: 4 });
    controller.click({ x: 7, y: 2 });
    expect(game.fixture(id)?.origin).toEqual({ x: 4, y: 4 });
    controller.cancel();
    expect(game.fixture(id)?.origin).toEqual({ x: 4, y: 4 });
    expect(interaction.state.selectedId).toBe(id);

    controller.startMoving(id);
    controller.click({ x: 7, y: 2 });
    controller.confirmPlacement();
    expect(game.fixture(id)?.origin).toEqual({ x: 7, y: 2 });
  });
});
