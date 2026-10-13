import { MINUTES_PER_STEP, minuteOfDay } from '../clock/clock';

/** 限時特價的折扣檔位：9 折、8 折、7 折 */
export const FLASH_SALE_TIERS = [0.9, 0.8, 0.7] as const;
export type FlashSaleTier = (typeof FLASH_SALE_TIERS)[number];

/** 限時特價持續的遊戲分鐘數（2 遊戲小時） */
export const FLASH_SALE_MINUTES = 120;

/** 同時進行的限時特價上限 */
export const MAX_FLASH_SALES = 2;

/** 限時特價持續的步數 */
const FLASH_SALE_STEPS = Math.round(FLASH_SALE_MINUTES / MINUTES_PER_STEP);

export function isFlashSaleTier(tier: number): tier is FlashSaleTier {
  return (FLASH_SALE_TIERS as readonly number[]).includes(tier);
}

/** 折扣後的價格：四捨五入到整數元，至少 $1 */
export function flashSalePrice(salePrice: number, tier: FlashSaleTier): number {
  return Math.max(1, Math.round(salePrice * tier));
}

/** 進行中的限時特價（唯讀） */
export interface FlashSale {
  readonly productId: string;
  readonly tier: FlashSaleTier;
  /** 特價期間的成交價 */
  readonly price: number;
  /** 結束時刻（一天中的分鐘數） */
  readonly endsAtMinute: number;
  /** 剩餘遊戲分鐘數 */
  readonly remainingMinutes: number;
}

interface ActiveSale {
  readonly productId: string;
  readonly tier: FlashSaleTier;
  readonly price: number;
  readonly endStep: number;
}

/** 營業時段中進行的限時特價；不存檔，打烊時清空（ADR 0002、0003） */
export class FlashSales {
  private active: ActiveSale[] = [];

  has(productId: string): boolean {
    return this.active.some((s) => s.productId === productId);
  }

  get count(): number {
    return this.active.length;
  }

  /** 特價中的成交價；沒有特價時為 undefined */
  priceOf(productId: string): number | undefined {
    return this.active.find((s) => s.productId === productId)?.price;
  }

  start(productId: string, tier: FlashSaleTier, price: number, step: number): void {
    this.active = [...this.active, { productId, tier, price, endStep: step + FLASH_SALE_STEPS }];
  }

  /** 移除到期的特價，回傳結束的商品 id */
  expire(step: number): string[] {
    const ended = this.active.filter((s) => step >= s.endStep).map((s) => s.productId);
    if (ended.length > 0) this.active = this.active.filter((s) => step < s.endStep);
    return ended;
  }

  clear(): void {
    this.active = [];
  }

  list(step: number): FlashSale[] {
    return this.active.map((s) => ({
      productId: s.productId,
      tier: s.tier,
      price: s.price,
      endsAtMinute: minuteOfDay(s.endStep),
      remainingMinutes: (s.endStep - step) * MINUTES_PER_STEP,
    }));
  }
}
