import { CUSTOMER_TYPE_IDS } from '../agents/demand';
import type { CustomerType } from '../agents/demand';
import type { CategoryId } from '../catalog/products';
import type { DailyGoalResult } from '../goals/daily-goal';
import type { IncidentRecord } from '../incidents/incidents';

/** 單一商品的報廢 */
export interface WasteLine {
  readonly productId: string;
  readonly qty: number;
  /** 以進貨成本計的損失 */
  readonly cost: number;
}

/** 單一顧客類型的來客與結帳人數 */
export interface TypeCount {
  readonly entered: number;
  readonly served: number;
}

/** 來客統計 */
export interface CustomerStats {
  /** 進店人數 */
  readonly entered: number;
  /** 結帳人數 */
  readonly served: number;
  /** 因缺貨或嫌貴空手離開 */
  readonly leftEmpty: number;
  /** 排隊太久放棄 */
  readonly abandoned: number;
  /** 平均滿意度（0–100）；沒有顧客時為 null */
  readonly avgSatisfaction: number | null;
  /** 依顧客類型分列的進店與結帳人數；各類型加總等於 entered 與 served */
  readonly byType: Readonly<Record<CustomerType, TypeCount>>;
}

/** 營業日結束時的進度變化 */
export interface DayProgress {
  readonly reputationBefore: number;
  readonly reputationAfter: number;
  /** 當天達成的里程碑 id */
  readonly milestonesReached: readonly string[];
  /** 連續資金為負的營業日數（含當天） */
  readonly negativeDays: number;
  readonly bankrupt: boolean;
}

/** 每日結算：一個營業日的營運摘要 */
export interface DailyReport {
  readonly day: number;
  readonly revenue: number;
  /** 各商品售出數量 */
  readonly sales: Readonly<Record<string, number>>;
  /** 各類別被顧客找不到的次數 */
  readonly stockouts: Readonly<Partial<Record<CategoryId, number>>>;
  readonly customers: CustomerStats;
  /** 準備階段開始時的資金 */
  readonly fundsAtStart: number;
  readonly fundsAtEnd: number;
  /** 當日下單的進貨支出（含一般進貨單運費與緊急叫貨的商品金額） */
  readonly purchases: number;
  /** 當日緊急叫貨的運費 */
  readonly rushShipping: number;
  /** 當日購買設施的支出（已扣除出售回收） */
  readonly fixtures: number;
  readonly rent: number;
  readonly wages: number;
  readonly waste: readonly WasteLine[];
  /** 當天曾限時特價的類別 */
  readonly flashSaleCategories: readonly CategoryId[];
  /** 今日狀況：每個狀況的名稱、時刻與所選選項 */
  readonly incidents: readonly IncidentRecord[];
  /** 狀況支出：選項費用合計 */
  readonly incidentCosts: number;
  /** 今天的每日目標與判定結果；沒有每日目標（第 1 天）時為 null */
  readonly dailyGoal: DailyGoalResult | null;
  /** 每日目標發放的資金獎勵（沒有時為 0）；口碑獎勵已併入 progress 的口碑變化 */
  readonly goalFunds: number;
  readonly progress: DayProgress;
}

/** 營業日進行中逐步累積的帳目 */
export class DayLedger {
  revenue = 0;
  readonly sales = new Map<string, number>();
  readonly stockouts = new Map<CategoryId, number>();
  entered = 0;
  served = 0;
  private readonly byType = Object.fromEntries(CUSTOMER_TYPE_IDS.map((t) => [t, { entered: 0, served: 0 }])) as Record<
    CustomerType,
    { entered: number; served: number }
  >;
  leftEmpty = 0;
  abandoned = 0;
  /** 因缺貨空手離開（空手離開且曾遇到缺貨）的人數 */
  stockoutEmpty = 0;
  private satisfactionSum = 0;
  private satisfactionCount = 0;
  purchases = 0;
  rushShipping = 0;
  fixtures = 0;
  rent = 0;
  wages = 0;
  waste: WasteLine[] = [];
  /** 當天曾限時特價的類別 */
  readonly flashSaleCategories = new Set<CategoryId>();
  readonly incidents: IncidentRecord[] = [];
  incidentCosts = 0;
  /** 狀況造成、於打烊時套用的口碑變化 */
  incidentReputation = 0;
  /** 每日目標的判定結果（打烊時寫入） */
  dailyGoal: DailyGoalResult | null = null;
  /** 每日目標發放的資金獎勵 */
  goalFunds = 0;
  /** 每日目標造成、於打烊時套用的口碑變化 */
  goalReputation = 0;

  constructor(
    readonly day: number,
    readonly fundsAtStart: number,
  ) {}

  recordSale(productId: string, price: number): void {
    this.revenue += price;
    this.sales.set(productId, (this.sales.get(productId) ?? 0) + 1);
  }

  /** 顧客進店 */
  recordEntered(type: CustomerType): void {
    this.entered++;
    this.byType[type].entered++;
  }

  /** 顧客離店 */
  recordCustomer(
    type: CustomerType,
    outcome: 'served' | 'left-empty' | 'abandoned',
    satisfaction: number,
    stockoutCategories: readonly CategoryId[],
  ): void {
    for (const c of stockoutCategories) this.stockouts.set(c, (this.stockouts.get(c) ?? 0) + 1);
    if (outcome === 'served') {
      this.served++;
      this.byType[type].served++;
    }
    else if (outcome === 'left-empty') {
      this.leftEmpty++;
      if (stockoutCategories.length > 0) this.stockoutEmpty++;
    }
    else this.abandoned++;
    this.satisfactionSum += satisfaction;
    this.satisfactionCount++;
  }

  recordIncident(record: IncidentRecord): void {
    this.incidents.push(record);
    this.incidentCosts += record.cost;
  }

  get avgSatisfaction(): number | null {
    return this.satisfactionCount > 0 ? this.satisfactionSum / this.satisfactionCount : null;
  }

  toReport(fundsAtEnd: number, progress: DayProgress): DailyReport {
    return {
      day: this.day,
      revenue: this.revenue,
      sales: Object.fromEntries(this.sales),
      stockouts: Object.fromEntries(this.stockouts),
      progress,
      customers: {
        entered: this.entered,
        served: this.served,
        leftEmpty: this.leftEmpty,
        abandoned: this.abandoned,
        avgSatisfaction: this.avgSatisfaction,
        byType: Object.fromEntries(CUSTOMER_TYPE_IDS.map((t) => [t, { ...this.byType[t] }])) as Record<
          CustomerType,
          TypeCount
        >,
      },
      fundsAtStart: this.fundsAtStart,
      fundsAtEnd,
      purchases: this.purchases,
      rushShipping: this.rushShipping,
      fixtures: this.fixtures,
      rent: this.rent,
      wages: this.wages,
      waste: this.waste,
      flashSaleCategories: [...this.flashSaleCategories],
      incidents: [...this.incidents],
      incidentCosts: this.incidentCosts,
      dailyGoal: this.dailyGoal,
      goalFunds: this.goalFunds,
    };
  }
}
