/** 單一商品的報廢 */
export interface WasteLine {
  readonly productId: string;
  readonly qty: number;
  /** 以進貨成本計的損失 */
  readonly cost: number;
}

/**
 * 每日結算：一個營業日的營運摘要。
 * M6 會補上營收、來客、口碑等欄位。
 */
export interface DailyReport {
  readonly day: number;
  /** 準備階段開始時的資金 */
  readonly fundsAtStart: number;
  readonly fundsAtEnd: number;
  /** 當日下單的進貨支出（含運費） */
  readonly purchases: number;
  readonly rent: number;
  readonly wages: number;
  readonly waste: readonly WasteLine[];
}

/** 營業日進行中逐步累積的帳目 */
export class DayLedger {
  purchases = 0;
  rent = 0;
  wages = 0;
  waste: WasteLine[] = [];

  constructor(
    readonly day: number,
    readonly fundsAtStart: number,
  ) {}

  toReport(fundsAtEnd: number): DailyReport {
    return {
      day: this.day,
      fundsAtStart: this.fundsAtStart,
      fundsAtEnd,
      purchases: this.purchases,
      rent: this.rent,
      wages: this.wages,
      waste: this.waste,
    };
  }
}
