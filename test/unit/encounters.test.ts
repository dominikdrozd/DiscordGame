import {
  EXPEDITIONS,
  REGION_LVL_REQ,
  expeditionLvlBracket,
  expeditionMinLvl,
  REGION_NAMES,
} from '../../src/modules/game/engine/encounters.js';

describe('expeditionMinLvl', () => {
  test('returns 1 for tier 1', () => {
    expect(expeditionMinLvl(1)).toBe(1);
  });
  test('returns 8 for tier 2', () => {
    expect(expeditionMinLvl(2)).toBe(8);
  });
  test('returns 32 for tier 5', () => {
    expect(expeditionMinLvl(5)).toBe(32);
  });
});

describe('expeditionLvlBracket', () => {
  test('returns "1-7" for tier 1', () => {
    expect(expeditionLvlBracket(1)).toBe('1-7');
  });
  test('returns "32+" for tier 5', () => {
    expect(expeditionLvlBracket(5)).toBe('32+');
  });
});

describe('REGION_LVL_REQ', () => {
  test('has expected mapping', () => {
    expect(REGION_LVL_REQ).toEqual({ 1: 1, 2: 8, 3: 16, 4: 24 });
  });
});

describe('REGION_NAMES', () => {
  test('contains all 4 regions', () => {
    expect(REGION_NAMES[1]).toBe('Wybrzeże Szeptów');
    expect(REGION_NAMES[2]).toBe('Serce Quelthasee');
    expect(REGION_NAMES[3]).toBe('Żelazne Szczyty');
    expect(REGION_NAMES[4]).toBe('Przeklęta Północ');
  });
});

describe('EXPEDITIONS', () => {
  test('contains at least 15 wilderness expeditions across regions', () => {
    expect(Object.keys(EXPEDITIONS).length).toBeGreaterThanOrEqual(15);
  });

  test('every expedition has region 1-4 and tier 1-5', () => {
    for (const e of Object.values(EXPEDITIONS)) {
      expect([1, 2, 3, 4]).toContain(e.region);
      expect([1, 2, 3, 4, 5]).toContain(e.tier);
      expect(e.lootTable.length).toBeGreaterThan(0);
      expect(e.rolls).toBeGreaterThan(0);
    }
  });

  test('regions are distributed across all 4', () => {
    const byRegion = new Map<number, number>();
    for (const e of Object.values(EXPEDITIONS)) {
      byRegion.set(e.region, (byRegion.get(e.region) ?? 0) + 1);
    }
    expect(byRegion.size).toBe(4);
  });

  test('smocze_gniazdo is tier 5 in region 4', () => {
    expect(EXPEDITIONS.smocze_gniazdo.tier).toBe(5);
    expect(EXPEDITIONS.smocze_gniazdo.region).toBe(4);
  });
});
