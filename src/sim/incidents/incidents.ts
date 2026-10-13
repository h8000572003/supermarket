import type { Rng } from '../rng';

/**
 * 狀況（Incident）：營業時段中隨機發生、讓遊戲暫停並要店長擇一選項的情境。
 * 每種狀況以資料定義（前提條件、說明、2 個選項），Game 依效果種類套用。
 * 新增狀況時：在 IncidentKind 加 id、在 INCIDENTS 加定義；
 * 需要新的效果機制時，在 IncidentEffect 加一種並在 Game 的 applyIncidentEffect 處理。
 */
export type IncidentKind = 'influencer-visit' | 'staff-sick';

/** 判斷狀況能否發生時看得到的店況 */
export interface IncidentContext {
  readonly day: number;
  readonly funds: number;
  /** 今天正在上班的店員人數 */
  readonly workingStaff: number;
  /** 收銀台數量 */
  readonly registers: number;
}

/** 選項的效果；最晚在打烊時結束（口碑變化於當天結算套用） */
export type IncidentEffect =
  /** 當天結算時口碑增減 */
  | { readonly type: 'reputation'; readonly delta: number }
  /** 今天剩下的時間少這麼多位上班的店員（日薪照付） */
  | { readonly type: 'send-staff-home'; readonly count: number };

export interface IncidentOption {
  /** 選項名稱，如「招待」 */
  readonly label: string;
  /** 效果說明 */
  readonly detail: string;
  /** 選擇時立即支付的金額（可為 0） */
  readonly cost: number;
  readonly effects: readonly IncidentEffect[];
}

export interface IncidentDefinition {
  readonly kind: IncidentKind;
  readonly name: string;
  readonly description: string;
  /** 店況符合時才可能發生；開店排程時與實際發生時各檢查一次 */
  precondition(ctx: IncidentContext): boolean;
  readonly options: readonly [IncidentOption, IncidentOption];
}

export const INCIDENTS: readonly IncidentDefinition[] = [
  {
    kind: 'influencer-visit',
    name: '網紅來訪',
    description: '一位網紅走進店裡開直播，想拍店內介紹。好好招待能換來好評，不理會可能被說幾句。',
    precondition: () => true,
    options: [
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
    description: '一位店員覺得身體不舒服，問能不能提早下班。',
    precondition: (ctx) => ctx.workingStaff >= 1,
    options: [
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
}

/** 選項是否付得起：不花錢的選項永遠可選（資金為負時也是） */
export function canAfford(funds: number, cost: number): boolean {
  return cost <= 0 || funds >= cost;
}

/**
 * 開店時決定今天的狀況與發生時刻。
 * 第 1 天沒有；之後從「前一天沒發生過、且前提成立」的種類中抽 1–2 個（同一天不重複）。
 * 一天最多發生「種類總數 − 1」個，保證隔天至少還有種類可抽。
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
    scheduled.push({ kind: def.kind, minute: rng.int(...INCIDENT_WINDOW) });
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
  readonly cost: number;
}
