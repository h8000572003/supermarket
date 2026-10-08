import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../catalog/fixtures';
import { customerAccessTiles, footprint, footprintTiles, rotateClockwise, staffAccessTiles } from './geometry';

const shelf = FIXTURES.shelf;
const register = FIXTURES.register;
const at = { x: 3, y: 3 };

describe('設施幾何', () => {
  it('順時針旋轉一圈回到原朝向', () => {
    expect(rotateClockwise(rotateClockwise(rotateClockwise(rotateClockwise('north'))))).toBe('north');
  });

  it('2×1 貨架朝南時橫放、朝東時直放', () => {
    expect(footprintTiles(footprint(shelf, { origin: at, facing: 'south' }))).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
    expect(footprintTiles(footprint(shelf, { origin: at, facing: 'east' }))).toEqual([
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ]);
  });

  it('取用格位於正面前方、每個正面格各一', () => {
    expect(customerAccessTiles(shelf, { origin: at, facing: 'south' })).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
    expect(customerAccessTiles(shelf, { origin: at, facing: 'west' })).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });

  it('旋轉後取用格跟著改變', () => {
    expect(customerAccessTiles(register, { origin: at, facing: 'north' })).toEqual([{ x: 3, y: 2 }]);
    expect(customerAccessTiles(register, { origin: at, facing: 'east' })).toEqual([{ x: 4, y: 3 }]);
  });

  it('收銀台背面有店員側取用格，貨架沒有', () => {
    expect(staffAccessTiles(register, { origin: at, facing: 'south' })).toEqual([{ x: 3, y: 2 }]);
    expect(staffAccessTiles(shelf, { origin: at, facing: 'south' })).toEqual([]);
  });
});
