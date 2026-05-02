import {
  ambushTierForLevel,
  randomAmbushMob,
  AMBUSH_MOB_CLASSES_BY_ID,
  BOSS_MOBS,
} from '../../src/modules/game/mobs/index.js';
import { mockRandom } from '../helpers/factories.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ambushTierForLevel', () => {
  test('returns base tier 1 for combat lvl 1 when random < 0.7', () => {
    mockRandom([0.1]);
    expect(ambushTierForLevel(1)).toBe(1);
  });

  test('rolls base-1 with random in [0.7, 0.9) and clamps at 1', () => {
    mockRandom([0.75]);
    expect(ambushTierForLevel(1)).toBe(1); // base 1, base-1=0 clamped
  });

  test('rolls base+1 with random >= 0.9 and clamps at 5', () => {
    mockRandom([0.95]);
    expect(ambushTierForLevel(40)).toBe(5); // base 5, base+1=6 clamped
  });

  test('lvl 8 maps to base tier 2', () => {
    mockRandom([0.5]);
    expect(ambushTierForLevel(8)).toBe(2);
  });

  test('lvl 16 maps to base tier 3', () => {
    mockRandom([0.5]);
    expect(ambushTierForLevel(16)).toBe(3);
  });

  test('high lvl with base-1 random returns base-1', () => {
    mockRandom([0.8]);
    expect(ambushTierForLevel(24)).toBe(3); // base 4, base-1=3
  });

  test('mid lvl with base+1 random returns base+1', () => {
    mockRandom([0.92]);
    expect(ambushTierForLevel(8)).toBe(3); // base 2, base+1=3
  });
});

describe('randomAmbushMob', () => {
  test('filters pool by allowedIds', () => {
    mockRandom([0]); // pierwszy z listy
    const mob = randomAmbushMob({ allowedIds: ['ognisty_chochlik'] });
    expect(mob.id).toBe('ognisty_chochlik');
  });

  test('applies allowedTiers when explicit tier omitted', () => {
    // 1st random: pool pick. 2nd random: tier pick from allowedTiers.
    mockRandom([0, 0]);
    const mob = randomAmbushMob({ allowedTiers: [3, 4] });
    expect(mob.tier).toBe(3);
  });

  test('explicit tier overrides allowedTiers', () => {
    mockRandom([0]);
    const mob = randomAmbushMob({ tier: 5, allowedTiers: [1] });
    expect(mob.tier).toBe(5);
  });

  test('returns fresh instance per call (no shared state across spawns)', () => {
    mockRandom([0, 0]);
    const a = randomAmbushMob({ allowedIds: ['goblin_zlomiarz'] });
    const b = randomAmbushMob({ allowedIds: ['goblin_zlomiarz'] });
    expect(a).not.toBe(b);
    a.setTier(4);
    expect(b.tier).toBe(1); // tier change on a does not leak to b
  });
});

describe('mob registries', () => {
  test('AMBUSH_MOB_CLASSES_BY_ID maps every constructor by its sample.id', () => {
    expect(Object.keys(AMBUSH_MOB_CLASSES_BY_ID)).toEqual(
      expect.arrayContaining([
        'goblin_zlomiarz',
        'kupiec_zlodziej',
        'wilk_smazony',
        'bandyci_z_petlicy',
        'mafia_z_pragi',
        'trolle_z_bloku',
        'ognisty_chochlik',
        'mala_stazystka_demonow',
        'niedzielny_kierowca',
        'upior_z_pkp',
      ]),
    );
  });

  test('BOSS_MOBS contains expected 8 bosses', () => {
    expect(Object.keys(BOSS_MOBS)).toHaveLength(8);
  });
});
