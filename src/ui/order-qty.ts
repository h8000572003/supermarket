/**
 * 訂購量：低於最低訂購量的數字沒有意義。
 * 從 0 往上直接跳到最低訂購量，從最低訂購量往下直接歸零。
 */
export function snapOrderQty(next: number, current: number, minOrder: number): number {
  if (next <= 0) return 0;
  if (next >= minOrder) return next;
  return next > current ? minOrder : 0;
}
