import { describe, expect, it } from 'vitest';
import { snapOrderQty } from './order-qty';

describe('訂購量步進', () => {
  it('從 0 按＋：直接跳到最低訂購量', () => {
    expect(snapOrderQty(1, 0, 24)).toBe(24);
  });

  it('在最低訂購量按−：歸零', () => {
    expect(snapOrderQty(23, 24, 24)).toBe(0);
  });

  it('高於最低訂購量：照輸入', () => {
    expect(snapOrderQty(48, 24, 24)).toBe(48);
    expect(snapOrderQty(30, 0, 24)).toBe(30);
  });

  it('負數或 0：歸零', () => {
    expect(snapOrderQty(-24, 0, 24)).toBe(0);
  });
});
