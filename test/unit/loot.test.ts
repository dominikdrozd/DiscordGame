import { rollLoot, rollLootMany, MINING_TABLE } from '../../src/modules/game/services/loot.js';
import { mockRandom } from '../helpers/factories.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('rollLoot', () => {
  test('filters entries by minLevel and skillLevel', () => {
    // skillLevel 1 → eligible: ore_copper (lvl1), gem_diamond (lvl1).
    // weights 50 + 1 = 51, total=51. random*51 = 0 → r=0, ore_copper hit (-50 → -50<=0).
    mockRandom([0, 0]);
    const r = rollLoot(MINING_TABLE, 1);
    expect(r?.itemId).toBe('ore_copper');
  });

  test('picks weighted entry from MINING_TABLE with mocked random', () => {
    // skillLevel 35: all eligible. Total=109. random*109 ≈ 100 → ore_mithril/gem_diamond.
    // pick ore_copper: r low.
    mockRandom([0.001, 0]);
    const r = rollLoot(MINING_TABLE, 35);
    expect(r?.itemId).toBe('ore_copper');
  });

  test('returns null when table empty after filter', () => {
    const r = rollLoot([{ itemId: 'foo', weight: 5, minLevel: 99 }], 1);
    expect(r).toBeNull();
  });

  test('respects qty range with mocked random', () => {
    // ore_copper has qtyMin=1 qtyMax=2. random[1] = 0.99 → floor(0.99 * 2) = 1 → qty = 1+1 = 2.
    mockRandom([0, 0.99]);
    const r = rollLoot(MINING_TABLE, 1);
    expect(r?.qty).toBe(2);
  });

  test('skips entries with unknown itemId', () => {
    const table = [
      { itemId: 'unknown_xxx', weight: 100 },
      { itemId: 'ore_copper', weight: 1 },
    ];
    mockRandom([0, 0]);
    const r = rollLoot(table, 1);
    expect(r?.itemId).toBe('ore_copper');
  });
});

describe('rollLootMany', () => {
  test('returns array of length<=rolls with deterministic sequence', () => {
    // 3 rolls × 2 randoms each = 6
    mockRandom([0, 0, 0, 0, 0, 0]);
    const out = rollLootMany(MINING_TABLE, 1, 3);
    expect(out).toHaveLength(3);
    out.forEach((r) => expect(r.itemId).toBe('ore_copper'));
  });

  test('returns empty when table has no eligible entries', () => {
    const out = rollLootMany([{ itemId: 'foo', weight: 1, minLevel: 99 }], 1, 5);
    expect(out).toEqual([]);
  });
});
