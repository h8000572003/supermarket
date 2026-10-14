import { describe, expect, it } from 'vitest';
import { FIXTURES } from './catalog/fixtures';
import { STEPS_PER_DAY, STEP_MS } from './clock/clock';
import { Game } from './game';
import { totalQty } from './inventory/batch';
import { finishOpenHours, openStoreArranged, runOpenHours, tickResolving } from './test-helpers';

const CAP = FIXTURES.fridge.slotCapacity;

/**
 * 第 2 天準備階段、沒有顧客：冷藏櫃 4 格都放可樂，收銀台一台。
 * 格位 0–2 已滿，格位 3 有 slot3 瓶；倉庫有 cola 瓶可樂、tea 瓶綠茶（都是第 1 天送達）。
 */
function store({ staff = 1, slot3 = CAP, cola = 12, tea = 12 }: { staff?: number; slot3?: number; cola?: number; tea?: number } = {}) {
  const game = new Game({ seed: 1, customerArrivals: false });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 6, y: 3 }, facing: 'south' });
  const register = place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  for (let i = 0; i < 4; i++) game.assignSlot(fridge, i, 'cola');
  game.submitPurchaseOrder([{ productId: 'cola', qty: 3 * CAP + slot3 }]);
  const rest = [
    { productId: 'cola', qty: cola },
    { productId: 'green-tea', qty: tea },
  ].filter((l) => l.qty > 0);
  if (rest.length > 0) game.submitPurchaseOrder(rest);
  // 第 1 天開店時送達：擺好格位，其餘留在倉庫；沒有店員與顧客，到打烊都不變
  openStoreArranged(game, () => {
    for (let i = 0; i < 3; i++) game.restockSlot(fridge, i);
    game.restockSlot(fridge, 3, slot3);
  });
  finishOpenHours(game);
  game.startNextDay();
  for (let i = 0; i < staff; i++) game.hireStaff();
  const qty = (slotIndex: number) => totalQty(game.slots(fridge)[slotIndex]?.batches ?? []);
  const product = (slotIndex: number) => game.slots(fridge)[slotIndex]?.productId;
  /** 店內某商品的總數：倉庫 + 所有格位 + 店員手上 */
  const total = (productId: string) =>
    game.backroomQty(productId) +
    game.slots(fridge).reduce((n, s) => n + (s.productId === productId ? totalQty(s.batches) : 0), 0) +
    game.staffAgents.reduce((n, a) => n + totalQty(a.carrying.filter((b) => b.productId === productId)), 0);
  return { game, fridge, register, qty, product, total };
}

/** 逐步推進直到條件成立或打烊 */
function stepUntil(game: Game, done: () => boolean): void {
  while (game.phase === 'open' && !done()) tickResolving(game, STEP_MS);
}

function runToClose(game: Game): void {
  while (game.phase === 'open') tickResolving(game, STEP_MS * 10);
}

const STOCKED = ['cola', 'green-tea', 'chips', 'chocolate', 'cup-noodle', 'bowl-noodle'];

/** 有顧客的店面（同 customers.test.ts 的布置），staff 位店員；第 1 天已開店，開店時送達的貨已擺滿格位 */
function busyStore(staff = 0) {
  const game = new Game({ seed: 5 });
  const place = (...args: Parameters<Game['placeFixture']>) => {
    const r = game.placeFixture(...args);
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  const fridge = place('fridge', { origin: { x: 4, y: 0 }, facing: 'south' });
  const shelfA = place('shelf', { origin: { x: 8, y: 4 }, facing: 'west' });
  const shelfB = place('shelf', { origin: { x: 3, y: 5 }, facing: 'south' });
  const register = place('register', { origin: { x: 5, y: 7 }, facing: 'west' });
  ['cola', 'green-tea', 'cola', 'green-tea'].forEach((p, i) => game.assignSlot(fridge, i, p));
  ['chips', 'chips', 'chocolate', 'chocolate'].forEach((p, i) => game.assignSlot(shelfA, i, p));
  ['cup-noodle', 'cup-noodle', 'bowl-noodle', 'bowl-noodle'].forEach((p, i) => game.assignSlot(shelfB, i, p));
  game.submitPurchaseOrder(STOCKED.map((productId) => ({ productId, qty: 60 })));
  for (let i = 0; i < staff; i++) game.hireStaff();
  openStoreArranged(game, () => {
    for (const f of [fridge, shelfA, shelfB]) for (let i = 0; i < 4; i++) game.restockSlot(f, i);
  });
  return { game, fridge, register };
}


describe('換貨：發起', () => {
  it('布置：第 2 天，格位都放可樂，倉庫有可樂與綠茶', () => {
    const { game, qty, product } = store({ slot3: 2 });
    expect(game.day).toBe(2);
    expect([qty(0), qty(1), qty(2), qty(3)]).toEqual([CAP, CAP, CAP, 2]);
    expect(product(0)).toBe('cola');
    expect(game.backroomQty('cola')).toBe(12);
    expect(game.backroomQty('green-tea')).toBe(12);
  });

  it('準備階段指定格位商品仍立即生效，沒有換貨', () => {
    const { game, fridge, qty, product } = store();
    expect(game.assignSlot(fridge, 0, 'green-tea').ok).toBe(true);
    expect(product(0)).toBe('green-tea');
    expect(qty(0)).toBe(0);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
    expect(game.changeover(fridge, 0)).toBeNull();
    expect(game.changeovers).toEqual([]);
  });

  it('營業中指定格位商品會建立換貨：格位仍是舊商品，換貨目標可讀', () => {
    const { game, fridge, qty, product } = store({ staff: 0 });
    game.openStore();
    expect(game.changeover(fridge, 0)).toBeNull();
    expect(game.assignSlot(fridge, 0, 'green-tea').ok).toBe(true);
    expect(product(0)).toBe('cola');
    expect(qty(0)).toBe(CAP);
    expect(game.backroomQty('cola')).toBe(12);
    const expected = { fixtureId: fridge, slotIndex: 0, productId: 'green-tea' };
    expect(game.changeover(fridge, 0)).toEqual(expected);
    expect(game.changeovers).toEqual([expected]);
    expect(game.changeover(fridge, 1)).toBeNull();
  });

  it('同時可以有多個格位在換貨', () => {
    const { game, fridge } = store({ staff: 0 });
    game.openStore();
    for (let i = 0; i < 4; i++) expect(game.assignSlot(fridge, i, 'green-tea').ok).toBe(true);
    expect(game.changeovers.map((c) => c.slotIndex)).toEqual([0, 1, 2, 3]);
  });

  it('營業中指定成目前的商品：什麼都不變', () => {
    const { game, fridge } = store({ staff: 0 });
    game.openStore();
    expect(game.assignSlot(fridge, 0, 'cola').ok).toBe(true);
    expect(game.changeovers).toEqual([]);
  });

  it('營業中同樣拒絕未解鎖、陳列櫃類型不符、不存在的商品與格位', () => {
    const { game, fridge, register } = store({ staff: 0 });
    game.openStore();
    expect(game.assignSlot(fridge, 0, 'rice-ball')).toEqual({ ok: false, error: 'category-locked' });
    expect(game.assignSlot(fridge, 0, 'chips')).toEqual({ ok: false, error: 'wrong-display' });
    expect(game.assignSlot(fridge, 0, 'nope')).toEqual({ ok: false, error: 'unknown-product' });
    expect(game.assignSlot(fridge, 9, 'green-tea')).toEqual({ ok: false, error: 'invalid-slot' });
    expect(game.assignSlot(register, 0, 'green-tea')).toEqual({ ok: false, error: 'invalid-slot' });
    expect(game.changeovers).toEqual([]);
  });

  it('每日結算時仍不能指定格位商品', () => {
    const { game, fridge } = store({ staff: 0 });
    runOpenHours(game);
    expect(game.assignSlot(fridge, 0, 'green-tea')).toEqual({ ok: false, error: 'not-prep-phase' });
  });
});

describe('換貨：下架前', () => {
  it('舊商品留在架上，顧客照樣拿取', () => {
    const { game, fridge } = busyStore(); // 沒有店員：沒有人會來下架
    // 兩格可樂都換成礦泉水：想買飲料的顧客只能拿可樂或綠茶
    game.assignSlot(fridge, 0, 'water');
    game.assignSlot(fridge, 2, 'water');
    const colaOnShelf = () => totalQty(game.slots(fridge)[0]!.batches) + totalQty(game.slots(fridge)[2]!.batches);
    stepUntil(game, () => colaOnShelf() < 2 * CAP);
    expect(game.phase).toBe('open');
    expect(game.slots(fridge)[0]!.productId).toBe('cola');
    expect(game.slots(fridge)[2]!.productId).toBe('cola');
    expect(game.changeovers).toHaveLength(2);
  });

  it('不再有人補舊商品：已認領但還沒取貨的補貨也會放下', () => {
    // 格位 3 低於補貨門檻，店員開店後立刻去倉庫取可樂
    const { game, fridge, qty, product } = store({ slot3: 2 });
    game.openStore();
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'restock', slotIndex: 3 });
    expect(game.assignSlot(fridge, 3, 'green-tea').ok).toBe(true);
    // 下架之前，倉庫的可樂一瓶都沒被拿走
    while (game.phase === 'open' && game.changeover(fridge, 3)) {
      expect(game.backroomQty('cola')).toBe(12);
      tickResolving(game, STEP_MS);
    }
    expect(game.phase).toBe('open');
    runToClose(game);
    expect(product(3)).toBe('green-tea');
    expect(qty(3)).toBe(CAP);
    expect(game.backroomQty('cola')).toBe(12 + 2);
  });
});

describe('換貨：下架與上架', () => {
  it('店員一趟取下全部舊商品；取下那一刻格位改成新商品且為空；舊商品原批次退回倉庫；之後補上新商品', () => {
    const { game, fridge, qty, product } = store();
    game.openStore();
    const before = game.slots(fridge)[0]!.batches;
    game.assignSlot(fridge, 0, 'green-tea');
    const agent = game.staffAgents[0]!;
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    // 取下的那一刻
    expect(product(0)).toBe('green-tea');
    expect(qty(0)).toBe(0);
    expect(agent.carrying).toEqual(before);
    expect(game.backroomQty('cola')).toBe(12);
    // 搬回倉庫
    stepUntil(game, () => agent.carrying.length === 0);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
    // 新商品照一般補貨上架
    stepUntil(game, () => qty(0) === CAP);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('green-tea');
    expect(game.backroomQty('green-tea')).toBe(12 - CAP);
    runToClose(game);
    game.startNextDay();
    // 退回倉庫的舊商品保留原本的送達日（第 1 天）
    const colaBatches = game.snapshot()!.inventory.backroom.filter((b) => b.productId === 'cola');
    expect(colaBatches).toEqual([{ productId: 'cola', qty: 12 + CAP, arrivedDay: 1 }]);
  });

  it('下架途中店員的工作是下架，拿著舊商品走回倉庫門', () => {
    const { game, fridge } = store();
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'clear-out', fixtureId: fridge, slotIndex: 0 });
    stepUntil(game, () => agent.carrying.length > 0);
    expect(agent.activity).toBe('returning');
    expect(agent.carrying.every((b) => b.productId === 'cola')).toBe(true);
  });

  it('兩位店員不會同時下架同一格', () => {
    const { game, fridge, product } = store({ staff: 2 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    let maxClaims = 0;
    while (game.phase === 'open') {
      tickResolving(game, STEP_MS);
      const claims = game.staffAgents.filter((a) => a.task?.kind === 'clear-out').length;
      maxClaims = Math.max(maxClaims, claims);
    }
    expect(maxClaims).toBe(1);
    expect(product(0)).toBe('green-tea');
  });
});

describe('換貨：店員工作的優先順序', () => {
  it('下架優先於一般補貨', () => {
    // 格位 3 低於補貨門檻（一般補貨的對象），格位 0 換貨
    const { game, fridge, qty } = store({ slot3: 2 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    expect(game.staffAgents[0]!.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(qty(3)).toBe(2);
  });

  it('派工優先於下架：同時下令時先處理派工', () => {
    const { game, fridge, qty } = store({ slot3: 4 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    game.dispatch({ kind: 'slot', fixtureId: fridge, slotIndex: 3 });
    tickResolving(game, STEP_MS);
    expect(game.staffAgents[0]!.task).toMatchObject({ kind: 'restock', slotIndex: 3 });
    stepUntil(game, () => game.dispatches.length === 0);
    expect(qty(3)).toBe(CAP);
    // 派工完成時舊商品還沒被取下
    expect(game.changeover(fridge, 0)).not.toBeNull();
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
  });

  it('派工優先於下架：正要去下架的店員改去處理派工', () => {
    const { game, fridge } = store({ slot3: 4 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task?.kind).toBe('clear-out');
    game.dispatch({ kind: 'slot', fixtureId: fridge, slotIndex: 3 });
    tickResolving(game, STEP_MS);
    expect(agent.task).toMatchObject({ kind: 'restock', slotIndex: 3 });
    expect(agent.onDispatch).toBe(true);
    stepUntil(game, () => game.dispatches.length === 0);
    expect(game.changeover(fridge, 0)).not.toBeNull();
  });

  it('有人排隊的收銀台優先於下架', () => {
    const { game, fridge: f, register } = busyStore(1);
    const agent = game.staffAgents[0]!;
    stepUntil(game, () => agent.activity === 'cashier' && game.queueLength(register) > 1);
    expect(game.phase).toBe('open');
    game.assignSlot(f, 0, 'water');
    // 隊伍沒清空前，店員都留在收銀台
    while (game.phase === 'open' && game.queueLength(register) > 0) {
      expect(agent.registerId).toBe(register);
      expect(agent.task).toBeNull();
      tickResolving(game, STEP_MS);
    }
    stepUntil(game, () => game.changeover(f, 0) === null);
    expect(game.phase).toBe('open');
    expect(game.slots(f)[0]!.productId).toBe('water');
  });
});

describe('換貨：打烊', () => {
  it('打烊時還沒下架的換貨直接完成：舊商品退回倉庫、格位改成新商品', () => {
    const { game, fridge, qty, product, total } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    game.assignSlot(fridge, 1, 'green-tea');
    const cola = total('cola');
    runToClose(game);
    expect(game.changeovers).toEqual([]);
    expect([product(0), product(1), product(2)]).toEqual(['green-tea', 'green-tea', 'cola']);
    expect([qty(0), qty(1)]).toEqual([0, 0]);
    expect(game.backroomQty('cola')).toBe(12 + 2 * CAP);
    expect(total('cola')).toBe(cola);
    game.startNextDay();
    expect(game.changeovers).toEqual([]);
    // 隔天開店後新商品照一般補貨上架
    game.hireStaff();
    runOpenHours(game);
    expect([qty(0), qty(1)]).toEqual([CAP, 2]);
  });

  it('打烊時店員手上正搬著的舊商品退回倉庫，庫存總數守恆', () => {
    // 先量出從下令到取下需要幾步（店員閒著時的位置每天傍晚都一樣）
    const LATE = STEPS_PER_DAY - 600;
    const probe = store();
    probe.game.openStore();
    stepUntil(probe.game, () => probe.game.step >= LATE);
    probe.game.assignSlot(probe.fridge, 0, 'green-tea');
    stepUntil(probe.game, () => probe.game.changeover(probe.fridge, 0) === null);
    const clearSteps = probe.game.step - LATE;
    expect(clearSteps).toBeGreaterThan(0);

    const { game, fridge, product, total } = store();
    game.openStore();
    // 在打烊前剛好來得及取下、來不及搬回倉庫的時刻下令
    stepUntil(game, () => game.step >= STEPS_PER_DAY - clearSteps - 2);
    game.assignSlot(fridge, 0, 'green-tea');
    const cola = total('cola');
    const tea = total('green-tea');
    stepUntil(game, () => game.step >= STEPS_PER_DAY - 1);
    expect(game.phase).toBe('open');
    expect(game.staffAgents[0]!.carrying.length).toBeGreaterThan(0);
    expect(game.changeover(fridge, 0)).toBeNull();
    runToClose(game);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
    expect(total('cola')).toBe(cola);
    expect(total('green-tea')).toBe(tea);
    expect(product(0)).toBe('green-tea');
  });
});

describe('換貨：下架前的更改', () => {
  it('下架前改回原商品：換貨取消，舊商品仍在架上', () => {
    const { game, fridge, qty, product } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    expect(game.assignSlot(fridge, 0, 'cola').ok).toBe(true);
    expect(game.changeover(fridge, 0)).toBeNull();
    expect(game.changeovers).toEqual([]);
    expect(product(0)).toBe('cola');
    expect(qty(0)).toBe(CAP);
    runToClose(game);
    // 打烊時沒有換貨要完成
    expect(product(0)).toBe('cola');
    expect(qty(0)).toBe(CAP);
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('取消換貨時，已認領但還沒取下的店員放下下架並釋出格位', () => {
    const { game, fridge, qty, product } = store();
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    game.assignSlot(fridge, 0, 'cola');
    expect(agent.task).toBeNull();
    expect(agent.activity).toBe('idle');
    // 舊商品沒被取下
    stepUntil(game, () => game.step >= 200);
    expect(product(0)).toBe('cola');
    expect(qty(0)).toBe(CAP);
    expect(game.backroomQty('cola')).toBe(12);
    // 認領已釋出：再次換貨時店員會來下架
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    expect(agent.task).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('green-tea');
  });

  it('取消換貨後，舊商品重新列入一般補貨', () => {
    // 格位 3 低於補貨門檻；店員還沒認領前就發起換貨再取消
    const { game, fridge, qty, product } = store({ slot3: 2 });
    game.openStore();
    game.assignSlot(fridge, 3, 'green-tea');
    game.assignSlot(fridge, 3, 'cola');
    expect(game.changeovers).toEqual([]);
    stepUntil(game, () => qty(3) === CAP);
    expect(game.phase).toBe('open');
    expect(product(3)).toBe('cola');
    expect(game.backroomQty('cola')).toBe(12 - (CAP - 2));
  });

  it('下架前改成第三種商品：只更新換貨目標，下架後格位為第三種商品', () => {
    const { game, fridge, qty, product } = store();
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    const claimed = agent.task;
    expect(claimed).toMatchObject({ kind: 'clear-out', slotIndex: 0 });
    expect(game.assignSlot(fridge, 0, 'water').ok).toBe(true);
    expect(game.changeovers).toEqual([{ fixtureId: fridge, slotIndex: 0, productId: 'water' }]);
    // 店員照原本的下架繼續，不會重來
    expect(agent.task).toBe(claimed);
    expect(product(0)).toBe('cola');
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBe('water');
    expect(qty(0)).toBe(0);
    stepUntil(game, () => agent.carrying.length === 0);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
  });

  it('改成第三種商品後打烊：格位為第三種商品', () => {
    const { game, fridge, product } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, 'green-tea');
    game.assignSlot(fridge, 0, 'water');
    runToClose(game);
    expect(product(0)).toBe('water');
    expect(game.backroomQty('cola')).toBe(12 + CAP);
  });
});

describe('換貨：陳列庫存為 0', () => {
  it('營業中更換空格位立即生效，沒有換貨目標；之後新商品照一般補貨上架', () => {
    const { game, fridge, qty, product } = store({ slot3: 0 });
    game.openStore();
    expect(qty(3)).toBe(0);
    expect(game.assignSlot(fridge, 3, 'green-tea').ok).toBe(true);
    expect(product(3)).toBe('green-tea');
    expect(game.changeover(fridge, 3)).toBeNull();
    expect(game.changeovers).toEqual([]);
    stepUntil(game, () => qty(3) === CAP);
    expect(game.phase).toBe('open');
    expect(product(3)).toBe('green-tea');
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('已認領補舊商品、還沒取貨的店員改補新商品', () => {
    const { game, fridge, qty, product } = store({ slot3: 0 });
    game.openStore();
    tickResolving(game, STEP_MS);
    const agent = game.staffAgents[0]!;
    expect(agent.task).toMatchObject({ kind: 'restock', slotIndex: 3, productId: 'cola' });
    game.assignSlot(fridge, 3, 'green-tea');
    expect(agent.task).toBeNull();
    stepUntil(game, () => qty(3) === CAP);
    expect(game.phase).toBe('open');
    expect(product(3)).toBe('green-tea');
    expect(game.backroomQty('cola')).toBe(12);
  });

  it('營業中把空格位改成不指定商品：立即清空', () => {
    const { game, fridge, product } = store({ slot3: 0, staff: 0 });
    game.openStore();
    expect(game.assignSlot(fridge, 3, null).ok).toBe(true);
    expect(product(3)).toBeNull();
    expect(game.changeovers).toEqual([]);
  });

  it('換貨中舊商品賣光後再更改：立即生效，原本的換貨取消', () => {
    const { game, fridge } = busyStore(); // 沒有店員：沒有人會來下架
    game.assignSlot(fridge, 0, 'water');
    stepUntil(game, () => totalQty(game.slots(fridge)[0]!.batches) === 0);
    expect(game.phase).toBe('open');
    expect(game.changeover(fridge, 0)).not.toBeNull();
    expect(game.assignSlot(fridge, 0, 'green-tea').ok).toBe(true);
    expect(game.slots(fridge)[0]!.productId).toBe('green-tea');
    expect(game.changeover(fridge, 0)).toBeNull();
    expect(game.changeovers).toEqual([]);
  });
});

describe('換貨：改成不指定商品', () => {
  it('下架後格位不指定商品，舊商品退回倉庫，之後不再補貨', () => {
    const { game, fridge, qty, product } = store();
    game.openStore();
    expect(game.assignSlot(fridge, 0, null).ok).toBe(true);
    expect(game.changeover(fridge, 0)).toEqual({ fixtureId: fridge, slotIndex: 0, productId: null });
    expect(product(0)).toBe('cola');
    const agent = game.staffAgents[0]!;
    stepUntil(game, () => game.changeover(fridge, 0) === null);
    expect(game.phase).toBe('open');
    expect(product(0)).toBeNull();
    expect(qty(0)).toBe(0);
    stepUntil(game, () => agent.carrying.length === 0);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
    runToClose(game);
    expect(product(0)).toBeNull();
    expect(qty(0)).toBe(0);
    expect(game.backroomQty('cola')).toBe(12 + CAP);
  });

  it('打烊時還沒下架：格位不指定商品，舊商品退回倉庫', () => {
    const { game, fridge, product, total } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, null);
    const cola = total('cola');
    runToClose(game);
    expect(product(0)).toBeNull();
    expect(game.backroomQty('cola')).toBe(12 + CAP);
    expect(total('cola')).toBe(cola);
  });

  it('清空換貨下架前改回原商品：取消', () => {
    const { game, fridge, product } = store({ staff: 0 });
    game.openStore();
    game.assignSlot(fridge, 0, null);
    game.assignSlot(fridge, 0, 'cola');
    expect(game.changeovers).toEqual([]);
    expect(product(0)).toBe('cola');
  });
});
