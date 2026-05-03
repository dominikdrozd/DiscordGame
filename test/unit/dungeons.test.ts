import { DUNGEONS, dungeonRoomTier } from '../../src/modules/game/engine/encounters.js';
import { BOSS_MOBS } from '../../src/modules/game/mobs/index.js';
import { ITEMS } from '../../src/modules/game/services/items.js';

describe('DUNGEONS registry', () => {
  test('contains 6 dungeons (2 oryginalnych + 4 nowe)', () => {
    expect(Object.keys(DUNGEONS)).toHaveLength(6);
    expect(Object.keys(DUNGEONS)).toEqual(
      expect.arrayContaining([
        'spizarnia_babci',
        'smocza_dziupla',
        'zatopiony_wrak',
        'debowe_korzenie',
        'mrozna_cytadela',
        'krypta_lichow',
      ]),
    );
  });

  test('każdy dungeon ma baseTier 1-5 i minPartySize >= 2', () => {
    for (const def of Object.values(DUNGEONS)) {
      expect([1, 2, 3, 4, 5]).toContain(def.baseTier);
      expect(def.minPartySize).toBeGreaterThanOrEqual(2);
      expect(def.minPartySize).toBeLessThanOrEqual(4);
    }
  });

  test('każdy boss z rooms[] istnieje w BOSS_MOBS', () => {
    for (const def of Object.values(DUNGEONS)) {
      for (const bossId of def.rooms) {
        expect(BOSS_MOBS[bossId]).toBeDefined();
      }
    }
  });

  test('każdy item w finalReward.lootTable i dropPool istnieje w ITEMS', () => {
    for (const def of Object.values(DUNGEONS)) {
      for (const entry of def.finalReward.lootTable ?? []) {
        expect(ITEMS[entry.itemId]).toBeDefined();
      }
      for (const itemId of def.finalReward.dropPool ?? []) {
        expect(ITEMS[itemId]).toBeDefined();
      }
    }
  });

  test('średnia XP rośnie wraz z baseTier (dungeony tej samej klasy mogą się różnić)', () => {
    const byTier = new Map<number, number[]>();
    for (const def of Object.values(DUNGEONS)) {
      const arr = byTier.get(def.baseTier) ?? [];
      arr.push(def.finalReward.xp);
      byTier.set(def.baseTier, arr);
    }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    let prevAvg = 0;
    for (const t of tiers) {
      const arr = byTier.get(t)!;
      const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
      expect(avg).toBeGreaterThan(prevAvg);
      prevAvg = avg;
    }
  });

  test('endgame dungeon krypta_lichow wymaga 4-osobowego party', () => {
    expect(DUNGEONS.krypta_lichow.minPartySize).toBe(4);
    expect(DUNGEONS.krypta_lichow.requiredCombatLevel).toBe(32);
    expect(DUNGEONS.krypta_lichow.baseTier).toBe(5);
  });
});

describe('dungeonRoomTier', () => {
  test('non-final rooms = baseTier; final room = baseTier+1 (clamped 5)', () => {
    const def = DUNGEONS.spizarnia_babci; // baseTier 2, 3 rooms
    expect(dungeonRoomTier(def, 0)).toBe(2);
    expect(dungeonRoomTier(def, 1)).toBe(2);
    expect(dungeonRoomTier(def, 2)).toBe(3); // final +1
  });

  test('baseTier 5 dungeon: final room nadal 5 (clamped)', () => {
    const def = DUNGEONS.krypta_lichow; // baseTier 5, 5 rooms
    expect(dungeonRoomTier(def, 0)).toBe(5);
    expect(dungeonRoomTier(def, 4)).toBe(5);
  });

  test('baseTier 4 dungeon: final = 5', () => {
    const def = DUNGEONS.mrozna_cytadela; // baseTier 4
    const lastIdx = def.rooms.length - 1;
    expect(dungeonRoomTier(def, lastIdx)).toBe(5);
    expect(dungeonRoomTier(def, lastIdx - 1)).toBe(4);
  });
});

describe('Items registry — nowe itemy z dungeonów', () => {
  test('3 gemy (ruby/sapphire/emerald) zarejestrowane', () => {
    expect(ITEMS.gem_ruby).toBeDefined();
    expect(ITEMS.gem_sapphire).toBeDefined();
    expect(ITEMS.gem_emerald).toBeDefined();
  });

  test('potion_greater zarejestrowany jako consumable rare', () => {
    expect(ITEMS.potion_greater).toBeDefined();
    expect(ITEMS.potion_greater.type).toBe('consumable');
    expect(ITEMS.potion_greater.rarity).toBe('rare');
  });

  test('sword/armor diamond + runicum (T4-T5) zarejestrowane', () => {
    expect(ITEMS.sword_diamond?.rarity).toBe('epic');
    expect(ITEMS.armor_diamond?.rarity).toBe('epic');
    expect(ITEMS.sword_runicum?.rarity).toBe('legendary');
    expect(ITEMS.armor_runicum?.rarity).toBe('legendary');
  });
});
