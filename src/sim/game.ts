import { FIXTURES, SELL_REFUND_RATE } from './catalog/fixtures';
import type { FixtureKind } from './catalog/fixtures';
import { Rng } from './rng';
import { rotateClockwise } from './store/geometry';
import type { Placement } from './store/geometry';
import { StoreLayout } from './store/store-layout';
import type { Fixture, PlacementError } from './store/store-layout';

export type Phase = 'prep';

export type CommandError =
  | PlacementError
  /** 只能在準備階段執行 */
  | 'not-prep-phase'
  /** 資金不足 */
  | 'insufficient-funds'
  /** 找不到指定的設施 */
  | 'unknown-fixture';

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: CommandError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: CommandError): Result<never> => ({ ok: false, error });

export const STARTING_FUNDS = 30_000;

export interface GameOptions {
  seed: number;
}

/** 模擬核心的唯一入口：commands 改變狀態、唯讀 getter 查詢、subscribe 監聽變化 */
export class Game {
  readonly rng: Rng;
  private readonly layout = new StoreLayout();
  private _funds = STARTING_FUNDS;
  private _phase: Phase = 'prep';
  private nextFixtureId = 1;
  private _version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: GameOptions) {
    this.rng = Rng.fromSeed(options.seed);
  }

  get funds(): number {
    return this._funds;
  }

  get phase(): Phase {
    return this._phase;
  }

  /** 每次狀態改變遞增，供 UI 判斷是否需要重繪 */
  get version(): number {
    return this._version;
  }

  get fixtures(): readonly Fixture[] {
    return this.layout.list();
  }

  fixture(id: string): Fixture | undefined {
    return this.layout.get(id);
  }

  fixtureAt(p: { x: number; y: number }): Fixture | undefined {
    return this.layout.fixtureAt(p);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 預檢擺放（含資金）；movingId 表示移動既有設施，不需付費 */
  checkPlacement(kind: FixtureKind, placement: Placement, movingId?: string): CommandError | null {
    if (this._phase !== 'prep') return 'not-prep-phase';
    if (!movingId && this._funds < FIXTURES[kind].price) return 'insufficient-funds';
    return this.layout.validate(kind, placement, movingId);
  }

  placeFixture(kind: FixtureKind, placement: Placement): Result<Fixture> {
    const error = this.checkPlacement(kind, placement);
    if (error) return fail(error);
    const fixture: Fixture = { id: `f${this.nextFixtureId++}`, kind, ...placement };
    this.layout.put(fixture);
    this._funds -= FIXTURES[kind].price;
    this.changed();
    return ok(fixture);
  }

  moveFixture(id: string, placement: Placement): Result<Fixture> {
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    const error = this.checkPlacement(current.kind, placement, id);
    if (error) return fail(error);
    const moved: Fixture = { ...current, ...placement };
    this.layout.put(moved);
    this.changed();
    return ok(moved);
  }

  rotateFixture(id: string): Result<Fixture> {
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    return this.moveFixture(id, { origin: current.origin, facing: rotateClockwise(current.facing) });
  }

  /** 出售設施，回收購買價的一部分；回傳回收金額 */
  sellFixture(id: string): Result<number> {
    if (this._phase !== 'prep') return fail('not-prep-phase');
    const current = this.layout.get(id);
    if (!current) return fail('unknown-fixture');
    const refund = sellRefund(current.kind);
    this.layout.remove(id);
    this._funds += refund;
    this.changed();
    return ok(refund);
  }

  private changed(): void {
    this._version++;
    for (const listener of this.listeners) listener();
  }
}

export function sellRefund(kind: FixtureKind): number {
  return Math.floor(FIXTURES[kind].price * SELL_REFUND_RATE);
}
