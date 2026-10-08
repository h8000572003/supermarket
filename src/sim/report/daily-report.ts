import type { CategoryId } from '../catalog/products';

/** 單一商品的報廢 */
export interface WasteLine {
  readonly productId: string;
  readonly qty: number;
  /** 以進貨成本計的損失 */
  readonly cost: number;
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
  /** 當日下單的進貨支出（含運費） */
  readonly purchases: number;
  readonly rent: number;
  readonly wages: number;
  readonly waste: readonly WasteLine[];
  readonly progress: DayProgress;
}

/** 營業日進行中逐步累積的帳目 */
export class DayLedger {
  revenue = 0;
  readonly sales = new Map<string, number>();
  readonly stockouts = new Map<CategoryId, number>();
  entered = 0;
  served = 0;
  leftEmpty = 0;
  abandoned = 0;
  private satisfactionSum = 0;
  private satisfactionCount = 0;
  purchases = 0;
  rent = 0;
  wages = 0;
  waste: WasteLine[] = [];

  constructor(
    readonly day: number,
    readonly fundsAtStart: number,
  ) {}

  recordSale(productId: string, price: number): void {
    this.revenue += price;
    this.sales.set(productId, (this.sales.get(productId) ?? 0) + 1);
  }

  recordCustomer(
    outcome: 'served' | 'left-empty' | 'abandoned',
    satisfaction: number,
    stockoutCategories: readonly CategoryId[],
  ): void {
    for (const c of stockoutCategories) this.stockouts.set(c, (this.stockouts.get(c) ?? 0) + 1);
    if (outcome === 'served') this.served++;
    else if (outcome === 'left-empty') this.leftEmpty++;
    else this.abandoned++;
    this.satisfactionSum += satisfaction;
    this.satisfactionCount++;
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
      },
      fundsAtStart: this.fundsAtStart,
      fundsAtEnd,
      purchases: this.purchases,
      rent: this.rent,
      wages: this.wages,
      waste: this.waste,
    };
  }
}
