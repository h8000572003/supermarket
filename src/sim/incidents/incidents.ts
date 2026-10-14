import { CATEGORIES, productById } from '../catalog/products';
import type { CategoryId } from '../catalog/products';
import { goodsTotal } from '../economy/purchase-order';
import type { OrderLine } from '../economy/purchase-order';
import type { Rng } from '../rng';
import type { Weather } from '../weather/weather';

/**
 * 狀況（Incident）：營業時段中隨機發生、讓遊戲暫停並要店長擇一選項的情境。
 * 每種狀況以資料定義（前提條件、參數、說明、2 個選項），Game 依效果種類套用。
 * 新增狀況時：在 IncidentKind 加 id、在 INCIDENTS 加定義；
 * 需要新的效果機制時，在 IncidentEffect 加一種並在 Game 的 applyIncidentEffect 處理。
 * 每次發生內容不同的狀況（例如出清哪個商品）以 rollParams 在開店排程時決定參數。
 */
export type IncidentKind = 'influencer-visit' | 'staff-sick' | 'group-visit' | 'heat-wave' | 'supplier-clearance';

/** 判斷狀況能否發生時看得到的店況 */
export interface IncidentContext {
  readonly day: number;
  /** 今天的天氣 */
  readonly weather: Weather;
  readonly funds: number;
  /** 今天正在上班的店員人數 */
  readonly workingStaff: number;
  /** 收銀台數量 */
  readonly registers: number;
  /** 已解鎖且店裡有格位陳列的商品 id（依陳列順序、不重複） */
  readonly displayedProducts: readonly string[];
}

/** 開店排程時決定、這一次狀況特有的參數；不需要參數的狀況為空物件 */
export interface IncidentParams {
  /** 這次狀況涉及的商品（供應商出清） */
  readonly productId?: string;
  /** 這次狀況的進貨明細（熱浪的免運費叫貨、供應商出清的那一批） */
  readonly lines?: readonly OrderLine[];
}

/** 選項的效果；最晚在打烊時結束（口碑變化於當天結算套用） */
export type IncidentEffect =
  /** 當天結算時口碑增減 */
  | { readonly type: 'reputation'; readonly delta: number }
  /** 今天剩下的時間少這麼多位上班的店員（日薪照付） */
  | { readonly type: 'send-staff-home'; readonly count: number }
  /** 接下來 minutes 遊戲分鐘的來客速率乘上 multiplier（最晚到打烊） */
  | { readonly type: 'arrival-surge'; readonly multiplier: number; readonly minutes: number }
  /** 今天剩下的時間，該類別出現在購物清單的權重乘上 multiplier */
  | { readonly type: 'category-demand'; readonly category: CategoryId; readonly multiplier: number }
  /** 對人最多的收銀台派工，店員至少待命 minutes 遊戲分鐘（見 Game 的說明） */
  | { readonly type: 'dispatch-busiest-register'; readonly minutes: number }
  /** 免運費、不佔每日次數、只限該類別的緊急叫貨；商品金額計入進貨成本 */
  | { readonly type: 'free-rush-order'; readonly category: CategoryId; readonly lines: readonly OrderLine[] }
  /** 以 goods 的總價買下 lines，當場送達倉庫；金額計入進貨成本 */
  | { readonly type: 'instant-delivery'; readonly lines: readonly OrderLine[]; readonly goods: number };

export interface IncidentOption {
  /** 選項名稱，如「招待」 */
  readonly label: string;
  /** 效果說明 */
  readonly detail: string;
  /** 選擇時立即支付的總金額（可為 0）；含進貨的部分（見 optionGoods），其餘計入狀況支出 */
  readonly cost: number;
  readonly effects: readonly IncidentEffect[];
}

export type IncidentOptions = readonly [IncidentOption, IncidentOption];

export interface IncidentDefinition {
  readonly kind: IncidentKind;
  readonly name: string;
  /** 店況符合時才可能發生；開店排程時與實際發生時各檢查一次 */
  precondition(ctx: IncidentContext): boolean;
  /** 開店排程時決定這次的參數（只在前提成立時呼叫）；省略表示沒有參數、不消耗亂數 */
  rollParams?(rng: Rng, ctx: IncidentContext): IncidentParams;
  /** 依參數產生這次的說明 */
  description(params: IncidentParams): string;
  /** 依參數產生這次的 2 個選項；至少一個不花錢 */
  options(params: IncidentParams): IncidentOptions;
}

/** 選項費用中屬於進貨的金額（計入進貨成本，不算狀況支出） */
export function optionGoods(option: IncidentOption): number {
  return option.effects.reduce((sum, e) => {
    if (e.type === 'free-rush-order') return sum + goodsTotal(e.lines);
    if (e.type === 'instant-delivery') return sum + e.goods;
    return sum;
  }, 0);
}

/** 團客來店：來客倍率與持續的遊戲分鐘數 */
export const GROUP_VISIT_MULTIPLIER = 3;
export const GROUP_VISIT_MINUTES = 30;
/** 熱浪：當天飲料類別需求倍率 */
export const HEAT_WAVE_DEMAND = 2;
/** 供應商出清：進價折數與一批的數量（最低訂購量的倍數） */
export const CLEARANCE_RATE = 0.7;
export const CLEARANCE_BATCH_MULTIPLE = 2;

const productName = (id: string | undefined) => (id ? (productById(id)?.name ?? id) : '');
const describeLines = (lines: readonly OrderLine[]) =>
  lines.map((l) => `${productName(l.productId)} ×${l.qty}`).join('、');
const DRINK_NAME = CATEGORIES.drink.name;

/** 熱浪的免運費叫貨明細：店裡陳列的每種飲料各訂最低訂購量 */
function heatWaveLines(ctx: IncidentContext): OrderLine[] {
  return ctx.displayedProducts.flatMap((id) => {
    const p = productById(id);
    return p?.category === 'drink' ? [{ productId: id, qty: p.minOrder }] : [];
  });
}

/** 供應商出清的一批：最低訂購量 × 2，總價為進價 7 折（四捨五入到整數） */
export function clearanceBatch(productId: string): { line: OrderLine; goods: number } {
  const p = productById(productId);
  if (!p) throw new Error(`unknown product: ${productId}`);
  const qty = p.minOrder * CLEARANCE_BATCH_MULTIPLE;
  return { line: { productId, qty }, goods: Math.round(qty * p.cost * CLEARANCE_RATE) };
}

export const INCIDENTS: readonly IncidentDefinition[] = [
  {
    kind: 'influencer-visit',
    name: '網紅來訪',
    description: () => '一位網紅走進店裡開直播，想拍店內介紹。好好招待能換來好評，不理會可能被說幾句。',
    precondition: () => true,
    options: () => [
      {
        label: '招待',
        detail: '請喝飲料、配合拍攝；今天結算時口碑 +3',
        cost: 200,
        effects: [{ type: 'reputation', delta: 3 }],
      },
      {
        label: '不理會',
        detail: '照常營業；今天結算時口碑 −1',
        cost: 0,
        effects: [{ type: 'reputation', delta: -1 }],
      },
    ],
  },
  {
    kind: 'staff-sick',
    name: '店員身體不適',
    description: () => '一位店員覺得身體不舒服，問能不能提早下班。',
    precondition: (ctx) => ctx.workingStaff >= 1,
    options: () => [
      {
        label: '加給讓他撐完',
        detail: '付一筆加給，今天人手不變',
        cost: 300,
        effects: [],
      },
      {
        label: '讓他提早下班',
        detail: '今天剩下的時間少一位店員；日薪照付',
        cost: 0,
        effects: [{ type: 'send-staff-home', count: 1 }],
      },
    ],
  },
  {
    kind: 'group-visit',
    name: '團客來店',
    description: () =>
      `一台遊覽車停在門口，接下來 ${GROUP_VISIT_MINUTES} 分鐘來客是平常的 ${GROUP_VISIT_MULTIPLIER} 倍，收銀台很快就會排起長隊。`,
    precondition: (ctx) => ctx.registers >= 1,
    options: () => {
      const surge: IncidentEffect = {
        type: 'arrival-surge',
        multiplier: GROUP_VISIT_MULTIPLIER,
        minutes: GROUP_VISIT_MINUTES,
      };
      return [
        {
          label: '派工到收銀台',
          detail: '自動對人最多的收銀台派工，一位店員在團客期間守在收銀台',
          cost: 0,
          effects: [surge, { type: 'dispatch-busiest-register', minutes: GROUP_VISIT_MINUTES }],
        },
        {
          label: '不處理',
          detail: '店員照常工作；隊伍太長時顧客可能放棄',
          cost: 0,
          effects: [surge],
        },
      ];
    },
  },
  {
    kind: 'heat-wave',
    name: '熱浪',
    description: () => `氣溫飆高，今天${DRINK_NAME}的需求加倍。供應商願意免運費緊急送一次${DRINK_NAME}。`,
    // 熱浪是「突然變熱」：熱天不會發生，也就不會和熱天的飲料需求疊加
    precondition: (ctx) => ctx.weather !== 'hot' && heatWaveLines(ctx).length > 0,
    rollParams: (_rng, ctx) => ({ lines: heatWaveLines(ctx) }),
    options: (params) => {
      const lines = params.lines ?? [];
      const demand: IncidentEffect = { type: 'category-demand', category: 'drink', multiplier: HEAT_WAVE_DEMAND };
      return [
        {
          label: `免運費叫${DRINK_NAME}`,
          detail: `緊急叫貨 ${describeLines(lines)}，免運費、不佔今天的緊急叫貨次數，2 小時後送達倉庫`,
          cost: goodsTotal(lines),
          // 叫貨放在最前面：叫貨被拒時其他效果不會套用
          effects: [{ type: 'free-rush-order', category: 'drink', lines }, demand],
        },
        {
          label: '不處理',
          detail: `用現有庫存撐過今天的${DRINK_NAME}需求`,
          cost: 0,
          effects: [demand],
        },
      ];
    },
  },
  {
    kind: 'supplier-clearance',
    name: '供應商出清',
    description: (params) =>
      `供應商要出清一批${productName(params.productId)}，以進價 ${Math.round(CLEARANCE_RATE * 10)} 折賣給你，當場送進倉庫。`,
    precondition: (ctx) => ctx.displayedProducts.length > 0,
    rollParams: (rng, ctx) => ({ productId: rng.pick(ctx.displayedProducts) }),
    options: (params) => {
      const { line, goods } = clearanceBatch(params.productId ?? '');
      return [
        {
          label: `買下${productName(line.productId)} ×${line.qty}`,
          detail: `以進價 ${Math.round(CLEARANCE_RATE * 10)} 折買下，立即送達倉庫`,
          cost: goods,
          effects: [{ type: 'instant-delivery', lines: [line], goods }],
        },
        {
          label: '拒絕',
          detail: '不進這批貨',
          cost: 0,
          effects: [],
        },
      ];
    },
  },
];

export function incidentDefinition(kind: IncidentKind, definitions = INCIDENTS): IncidentDefinition {
  const def = definitions.find((d) => d.kind === kind);
  if (!def) throw new Error(`unknown incident: ${kind}`);
  return def;
}

/** 第一個會發生狀況的營業日 */
export const FIRST_INCIDENT_DAY = 2;
/** 狀況發生時刻的範圍（一天中的分鐘數，含兩端）：08:00–21:00 */
export const INCIDENT_WINDOW: readonly [number, number] = [8 * 60, 21 * 60];
export const MAX_INCIDENTS_PER_DAY = 2;

/** 開店時排定、今天預計發生的狀況 */
export interface ScheduledIncident {
  readonly kind: IncidentKind;
  /** 發生時刻（一天中的分鐘數） */
  readonly minute: number;
  /** 這次的參數（例如出清的商品） */
  readonly params: IncidentParams;
}

/** 選項是否付得起：不花錢的選項永遠可選（資金為負時也是） */
export function canAfford(funds: number, cost: number): boolean {
  return cost <= 0 || funds >= cost;
}

/**
 * 開店時決定今天的狀況與發生時刻。
 * 第 1 天沒有；之後從「前一天沒發生過、且前提成立」的種類中抽 1–2 個（同一天不重複）。
 * 一天最多發生「種類總數 − 1」個，保證隔天至少還有種類可抽。
 * 有參數的狀況在此以同一個亂數序列決定參數，所以同種子、同選擇下內容相同。
 * 沒有符合的種類時不消耗亂數。
 */
export function scheduleIncidents(
  rng: Rng,
  day: number,
  previousKinds: readonly IncidentKind[],
  ctx: IncidentContext,
  definitions: readonly IncidentDefinition[] = INCIDENTS,
): ScheduledIncident[] {
  if (day < FIRST_INCIDENT_DAY) return [];
  const pool = definitions.filter((d) => !previousKinds.includes(d.kind) && d.precondition(ctx));
  if (pool.length === 0) return [];
  const cap = Math.min(MAX_INCIDENTS_PER_DAY, pool.length, Math.max(1, definitions.length - 1));
  const count = rng.int(1, cap);
  const scheduled: ScheduledIncident[] = [];
  for (let i = 0; i < count; i++) {
    const def = pool.splice(rng.int(0, pool.length - 1), 1)[0] as IncidentDefinition;
    const minute = rng.int(...INCIDENT_WINDOW);
    scheduled.push({ kind: def.kind, minute, params: def.rollParams?.(rng, ctx) ?? {} });
  }
  return scheduled.sort((a, b) => a.minute - b.minute);
}

/** 等待店長選擇的狀況（唯讀狀態） */
export interface PendingIncident {
  readonly kind: IncidentKind;
  readonly name: string;
  readonly description: string;
  /** 發生時刻（一天中的分鐘數） */
  readonly minute: number;
  /** 這次的參數（例如出清的商品） */
  readonly params: IncidentParams;
  readonly options: readonly PendingIncidentOption[];
}

export interface PendingIncidentOption extends IncidentOption {
  /** 目前資金付得起、可以選擇 */
  readonly available: boolean;
}

/** 已處理的狀況，記入每日結算 */
export interface IncidentRecord {
  readonly kind: IncidentKind;
  readonly name: string;
  readonly minute: number;
  /** 所選選項的索引 */
  readonly option: number;
  readonly optionLabel: string;
  /** 狀況支出（選項費用中不屬於進貨的部分） */
  readonly cost: number;
  /** 選項費用中屬於進貨的金額（計入進貨成本） */
  readonly goods: number;
  /** 這次的參數（例如出清的商品） */
  readonly params: IncidentParams;
}
