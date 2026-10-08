import type { FixtureKind } from '../sim/catalog/fixtures';
import type { Game } from '../sim/game';
import { rotateClockwise } from '../sim/store/geometry';
import type { GridPoint } from '../sim/store/layout';
import type { Interaction } from './interaction';
import { ERROR_MESSAGES } from './messages';

/** 把店長的輸入（點擊、按鍵、按鈕）轉成 Game commands */
export class Controller {
  constructor(
    readonly game: Game,
    readonly interaction: Interaction,
  ) {}

  hover(cell: GridPoint | null): void {
    const prev = this.interaction.state.hover;
    if (prev?.x === cell?.x && prev?.y === cell?.y) return;
    this.interaction.update({ hover: cell });
  }

  click(cell: GridPoint): void {
    const { tool } = this.interaction.state;
    if (tool.mode === 'select') {
      this.interaction.update({ selectedId: this.game.fixtureAt(cell)?.id ?? null, message: null });
      return;
    }
    const placement = { origin: cell, facing: tool.facing };
    const result = tool.movingId
      ? this.game.moveFixture(tool.movingId, placement)
      : this.game.placeFixture(tool.kind, placement);
    if (!result.ok) {
      this.interaction.update({ message: ERROR_MESSAGES[result.error] });
    } else if (tool.movingId) {
      this.interaction.update({ tool: { mode: 'select' }, selectedId: tool.movingId, message: null });
    } else {
      this.interaction.update({ message: null });
    }
  }

  startPlacing(kind: FixtureKind): void {
    this.interaction.update({ tool: { mode: 'place', kind, facing: 'south' }, selectedId: null, message: null });
  }

  startMoving(id: string): void {
    const fixture = this.game.fixture(id);
    if (!fixture) return;
    this.interaction.update({
      tool: { mode: 'place', kind: fixture.kind, facing: fixture.facing, movingId: id },
      message: null,
    });
  }

  /** R 鍵：擺放中旋轉預覽，否則旋轉選取的設施 */
  rotate(): void {
    const { tool, selectedId } = this.interaction.state;
    if (tool.mode === 'place') {
      this.interaction.update({ tool: { ...tool, facing: rotateClockwise(tool.facing) } });
    } else if (selectedId) {
      const result = this.game.rotateFixture(selectedId);
      this.interaction.update({ message: result.ok ? null : ERROR_MESSAGES[result.error] });
    }
  }

  sell(id: string): void {
    const result = this.game.sellFixture(id);
    this.interaction.update(result.ok ? { selectedId: null, message: null } : { message: ERROR_MESSAGES[result.error] });
  }

  hire(): void {
    const r = this.game.hireStaff();
    this.interaction.update({ message: r.ok ? null : ERROR_MESSAGES[r.error] });
  }

  /** 解雇最後雇用的店員 */
  fireLast(): void {
    const last = this.game.staff.at(-1);
    if (!last) return;
    const r = this.game.fireStaff(last.id);
    this.interaction.update({ message: r.ok ? null : ERROR_MESSAGES[r.error] });
  }

  /** 右鍵 / Esc */
  cancel(): void {
    const { tool } = this.interaction.state;
    if (tool.mode === 'place') {
      this.interaction.update({ tool: { mode: 'select' }, selectedId: tool.movingId ?? null, message: null });
    } else {
      this.interaction.update({ selectedId: null, message: null });
    }
  }
}
