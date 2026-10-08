import { CATEGORIES, productById } from '../catalog/products';
import type { Batch } from './batch';

/**
 * 批次在第 day 個營業日是否已過保存期限。
 * 保存期限 L 天、第 d 天送達 → 可販售第 d … d+L−1 天，第 d+L 天開始時報廢。
 */
export function isExpired(batch: Batch, day: number): boolean {
  const product = productById(batch.productId);
  const shelfLife = product && CATEGORIES[product.category].shelfLife;
  return shelfLife !== undefined && day >= batch.arrivedDay + shelfLife;
}
