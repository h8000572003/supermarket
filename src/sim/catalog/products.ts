import type { FixtureKind } from './fixtures';

export type CategoryId = 'drink' | 'fresh' | 'snack' | 'noodle' | 'daily';

export interface CategoryDef {
  readonly id: CategoryId;
  readonly name: string;
  /** 只能陳列在這種陳列櫃 */
  readonly display: Extract<FixtureKind, 'shelf' | 'fridge'>;
  /** 保存期限（營業日數）；undefined 表示不會過期 */
  readonly shelfLife?: number;
}

export const CATEGORIES: Readonly<Record<CategoryId, CategoryDef>> = {
  drink: { id: 'drink', name: '飲料', display: 'fridge' },
  fresh: { id: 'fresh', name: '鮮食', display: 'fridge', shelfLife: 2 },
  snack: { id: 'snack', name: '零食', display: 'shelf' },
  noodle: { id: 'noodle', name: '泡麵', display: 'shelf' },
  daily: { id: 'daily', name: '日用品', display: 'shelf' },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

/** 遊戲開始時已解鎖的類別；其餘由里程碑解鎖 */
export const STARTING_CATEGORIES: readonly CategoryId[] = ['drink', 'snack', 'noodle'];

export interface ProductDef {
  readonly id: string;
  readonly name: string;
  readonly category: CategoryId;
  /** 進貨單價 */
  readonly cost: number;
  readonly suggestedPrice: number;
  /** 每張進貨單上此商品的最低訂購量 */
  readonly minOrder: number;
}

const product = (
  id: string,
  name: string,
  category: CategoryId,
  cost: number,
  suggestedPrice: number,
  minOrder: number,
): ProductDef => ({ id, name, category, cost, suggestedPrice, minOrder });

export const PRODUCTS: readonly ProductDef[] = [
  product('green-tea', '綠茶', 'drink', 12, 25, 12),
  product('cola', '可樂', 'drink', 15, 30, 12),
  product('water', '礦泉水', 'drink', 7, 15, 12),
  product('rice-ball', '飯糰', 'fresh', 18, 35, 6),
  product('sandwich', '三明治', 'fresh', 23, 45, 6),
  product('bento', '便當', 'fresh', 42, 80, 6),
  product('chips', '洋芋片', 'snack', 17, 35, 6),
  product('chocolate', '巧克力', 'snack', 20, 40, 6),
  product('cup-noodle', '杯麵', 'noodle', 15, 30, 6),
  product('bowl-noodle', '碗麵', 'noodle', 25, 50, 6),
  product('tissue', '衛生紙', 'daily', 33, 65, 6),
  product('toothbrush', '牙刷', 'daily', 17, 35, 6),
];

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export function productById(id: string): ProductDef | undefined {
  return BY_ID.get(id);
}
