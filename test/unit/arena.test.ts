import { buildRoundRobinPairs } from '../../src/modules/game/engine/arena.js';

describe('buildRoundRobinPairs — round-robin scheduling', () => {
  test('2 graczy → 1 para', () => {
    const pairs = buildRoundRobinPairs(['a', 'b']);
    expect(pairs).toEqual([['a', 'b']]);
  });

  test('3 graczy → 3 pary', () => {
    const pairs = buildRoundRobinPairs(['a', 'b', 'c']);
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  test('4 graczy → 6 par (każdy z każdym, n*(n-1)/2)', () => {
    const pairs = buildRoundRobinPairs(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(6);
  });

  test('8 graczy → 28 par', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const pairs = buildRoundRobinPairs(ids);
    expect(pairs).toHaveLength(28);
  });

  test('każda para występuje DOKŁADNIE raz (bez duplikatów, bez self-pair)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const pairs = buildRoundRobinPairs(ids);
    const seen = new Set<string>();
    for (const [a, b] of pairs) {
      expect(a).not.toBe(b);
      const key = [a, b].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(pairs.length);
  });

  test('pusty / 1-osobowy input → 0 par', () => {
    expect(buildRoundRobinPairs([])).toEqual([]);
    expect(buildRoundRobinPairs(['solo'])).toEqual([]);
  });
});
