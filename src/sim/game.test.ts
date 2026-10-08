import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { Game, STARTING_FUNDS, sellRefund } from './game';
import { BACKROOM_DOOR, ENTRANCE, STORE_DEPTH, STORE_WIDTH } from './store/layout';

const newGame = () => new Game({ seed: 1 });

describe('擺放設施', () => {
  it('擺放成功會扣款', () => {
    const game = newGame();
    const r = game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
    expect(r.ok).toBe(true);
    expect(game.funds).toBe(STARTING_FUNDS - FIXTURES.shelf.price);
    expect(game.fixtures).toHaveLength(1);
  });

  it('超出店面被拒', () => {
    const game = newGame();
    const r = game.placeFixture('shelf', { origin: { x: STORE_WIDTH - 1, y: 2 }, facing: 'south' });
    expect(r).toEqual({ ok: false, error: 'out-of-bounds' });
  });

  it('與其他設施重疊被拒', () => {
    const game = newGame();
    game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
    const r = game.placeFixture('fridge', { origin: { x: 3, y: 2 }, facing: 'south' });
    expect(r).toEqual({ ok: false, error: 'overlaps-fixture' });
  });

  it('不能放在入口上', () => {
    const game = newGame();
    const r = game.placeFixture('register', { origin: ENTRANCE, facing: 'north' });
    expect(r).toEqual({ ok: false, error: 'blocks-entrance' });
  });

  it('正面朝牆（取用格在店外）被拒', () => {
    const game = newGame();
    const r = game.placeFixture('shelf', { origin: { x: 2, y: 0 }, facing: 'north' });
    expect(r).toEqual({ ok: false, error: 'access-blocked' });
  });

  it('靠後牆、正面朝店內可以', () => {
    const game = newGame();
    expect(game.placeFixture('shelf', { origin: { x: 2, y: 0 }, facing: 'south' }).ok).toBe(true);
  });

  it('不能壓住其他設施的取用格', () => {
    const game = newGame();
    game.placeFixture('shelf', { origin: { x: 2, y: 0 }, facing: 'south' });
    const r = game.placeFixture('register', { origin: { x: 2, y: 1 }, facing: 'east' });
    expect(r).toEqual({ ok: false, error: 'covers-access' });
  });

  it('會把其他設施的取用格圍死的擺放被拒', () => {
    const game = newGame();
    // 貨架 A 靠右後角，取用格 (10,1)(11,1)；貨架 B 擋住下方
    expect(game.placeFixture('shelf', { origin: { x: 10, y: 0 }, facing: 'south' }).ok).toBe(true);
    expect(game.placeFixture('shelf', { origin: { x: 10, y: 2 }, facing: 'south' }).ok).toBe(true);
    // 收銀台堵住 (9,1)，A 的取用格便無路可達
    const r = game.placeFixture('register', { origin: { x: 9, y: 1 }, facing: 'west' });
    expect(r).toEqual({ ok: false, error: 'unreachable' });
  });

  it('不能放在倉庫門上', () => {
    const game = newGame();
    const r = game.placeFixture('register', { origin: BACKROOM_DOOR, facing: 'east' });
    expect(r).toEqual({ ok: false, error: 'blocks-backroom-door' });
  });

  it('不能讓倉庫門無路可達', () => {
    const game = newGame();
    // 倉庫門 (0,2)；上下用貨架堵住，右側再放一個就封死
    expect(game.placeFixture('shelf', { origin: { x: 0, y: 1 }, facing: 'north' }).ok).toBe(true);
    expect(game.placeFixture('shelf', { origin: { x: 0, y: 3 }, facing: 'south' }).ok).toBe(true);
    const r = game.placeFixture('register', { origin: { x: 1, y: 2 }, facing: 'east' });
    expect(r).toEqual({ ok: false, error: 'unreachable' });
  });

  it('沒錢時被拒', () => {
    const game = newGame();
    let placed = 0;
    for (let y = 0; y < STORE_DEPTH - 1; y += 2) {
      for (let x = 0; x + 1 < STORE_WIDTH; x += 2) {
        if (game.placeFixture('fridge', { origin: { x, y }, facing: 'south' }).ok) placed++;
      }
    }
    expect(placed).toBe(Math.floor(STARTING_FUNDS / FIXTURES.fridge.price));
    expect(game.checkPlacement('fridge', { origin: { x: 0, y: 8 }, facing: 'north' })).toBe('insufficient-funds');
  });
});

describe('移動、旋轉與出售', () => {
  it('移動不扣款', () => {
    const game = newGame();
    const r = game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
    if (!r.ok) throw new Error(r.error);
    const funds = game.funds;
    expect(game.moveFixture(r.value.id, { origin: { x: 6, y: 4 }, facing: 'north' }).ok).toBe(true);
    expect(game.funds).toBe(funds);
    expect(game.fixture(r.value.id)?.origin).toEqual({ x: 6, y: 4 });
  });

  it('移動時可以和自己原本的位置重疊', () => {
    const game = newGame();
    const r = game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
    if (!r.ok) throw new Error(r.error);
    expect(game.moveFixture(r.value.id, { origin: { x: 3, y: 2 }, facing: 'south' }).ok).toBe(true);
  });

  it('旋轉後若取用格出界則拒絕並保持原狀', () => {
    const game = newGame();
    const r = game.placeFixture('register', { origin: { x: 5, y: 0 }, facing: 'west' });
    // 朝西：顧客側 (4,0)、店員側 (6,0) → 合法；旋轉成朝北：顧客側 (5,−1) 出界
    if (!r.ok) throw new Error(r.error);
    expect(game.rotateFixture(r.value.id)).toEqual({ ok: false, error: 'access-blocked' });
    expect(game.fixture(r.value.id)?.facing).toBe('west');
  });

  it('出售回收 50%', () => {
    const game = newGame();
    const r = game.placeFixture('fridge', { origin: { x: 2, y: 2 }, facing: 'south' });
    if (!r.ok) throw new Error(r.error);
    expect(game.sellFixture(r.value.id)).toEqual({ ok: true, value: sellRefund('fridge') });
    expect(game.funds).toBe(STARTING_FUNDS - FIXTURES.fridge.price / 2);
    expect(game.fixtures).toHaveLength(0);
  });

  it('不存在的設施', () => {
    expect(newGame().sellFixture('nope')).toEqual({ ok: false, error: 'unknown-fixture' });
  });

  it('狀態改變時通知訂閱者', () => {
    const game = newGame();
    let calls = 0;
    game.subscribe(() => calls++);
    game.placeFixture('shelf', { origin: { x: 2, y: 2 }, facing: 'south' });
    expect(calls).toBe(1);
    expect(game.version).toBe(1);
  });
});
