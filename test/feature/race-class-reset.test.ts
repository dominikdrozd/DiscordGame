import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { RACES } from '../../src/modules/game/races/index.js';
import {
  CLASSES,
  findSubclass,
  SUBCLASS2_UNLOCK_LEVEL,
} from '../../src/modules/game/classes/index.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

describe('race / class / reset feature flow', () => {
  let testCtx: MongoStatsTest;
  let svc: PlayerStatsService;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    svc = testCtx.stats;
  });

  afterEach(async () => {
    await testCtx.cleanup();
  });

  test('applyRace adds race primary stats to player.primary', () => {
    const p = svc.get('p1', 'Tester');
    const race = RACES.krasnolud;
    const result = svc.applyRace(p, race.id, race.startingStats);
    expect(result.ok).toBe(true);
    expect(p.raceId).toBe('krasnolud');
    expect(p.primary).toEqual(race.startingStats);
  });

  test('resetRace subtracts the previously applied race stats cleanly', () => {
    const p = svc.get('p1', 'Tester');
    const race = RACES.elf;
    svc.applyRace(p, race.id, race.startingStats);
    expect(p.primary.agi).toBe(2);
    svc.resetRace(p, race.startingStats);
    expect(p.raceId).toBeUndefined();
    expect(p.primary).toEqual({ str: 0, agi: 0, wit: 0, int: 0 });
  });

  test('applyClass adds class primary deltas on top of race', () => {
    const p = svc.get('p1', 'Tester');
    svc.applyRace(p, 'krasnolud', RACES.krasnolud.startingStats);
    svc.applyClass(p, 'wojownik', CLASSES.wojownik.primaryBonus);
    expect(p.classId).toBe('wojownik');
    // krasnolud: str 3, wit 1; wojownik: str 2, wit 1 → str 5, wit 2
    expect(p.primary.str).toBe(5);
    expect(p.primary.wit).toBe(2);
  });

  test('applyClass refuses to overwrite existing classId', () => {
    const p = svc.get('p1', 'Tester');
    svc.applyClass(p, 'wojownik', CLASSES.wojownik.primaryBonus);
    const second = svc.applyClass(p, 'mag', CLASSES.mag.primaryBonus);
    expect(second.ok).toBe(false);
  });

  test('applySubclass2 requires combat lvl 40 and adds tier-2 primary', () => {
    const p = svc.get('p1', 'Tester');
    svc.applyClass(p, 'wojownik', CLASSES.wojownik.primaryBonus);
    p.subclassId = 'berserker';
    p.skills.combat.level = 39;
    const sub2 = findSubclass('wojownik', 'berserker')?.subclasses2?.[0];
    if (!sub2) throw new Error('expected krwawnik subclass');
    const tooLow = svc.applySubclass2(
      p,
      'berserker',
      sub2.id,
      sub2.primaryBonus,
      SUBCLASS2_UNLOCK_LEVEL,
    );
    expect(tooLow.ok).toBe(false);
    p.skills.combat.level = 40;
    const ok = svc.applySubclass2(
      p,
      'berserker',
      sub2.id,
      sub2.primaryBonus,
      SUBCLASS2_UNLOCK_LEVEL,
    );
    expect(ok.ok).toBe(true);
    expect(p.subclass2Id).toBe(sub2.id);
  });

  test('resetClass cofa class+subclass+subclass2 primary jednym wywołaniem', () => {
    const p = svc.get('p1', 'Tester');
    const klass = CLASSES.wojownik;
    const sub1 = klass.subclasses[0]; // berserker
    const sub2 = sub1.subclasses2?.[0]; // krwawnik
    if (!sub2) throw new Error('expected sub2');
    svc.applyClass(p, klass.id, klass.primaryBonus);
    p.subclassId = sub1.id;
    p.skills.combat.level = 40;
    svc.applySubclass2(p, sub1.id, sub2.id, sub2.primaryBonus, SUBCLASS2_UNLOCK_LEVEL);
    // primary = klass + sub1 dummy (sub1 not actually applied via applySubclass) + sub2
    // NOTE: the test focuses on resetClass arithmetic. We zero base before reset to isolate.
    p.primary = {
      str: klass.primaryBonus.str + sub1.primaryBonus.str + sub2.primaryBonus.str,
      agi: klass.primaryBonus.agi + sub1.primaryBonus.agi + sub2.primaryBonus.agi,
      wit: klass.primaryBonus.wit + sub1.primaryBonus.wit + sub2.primaryBonus.wit,
      int: klass.primaryBonus.int + sub1.primaryBonus.int + sub2.primaryBonus.int,
    };
    svc.resetClass(p, klass.primaryBonus, sub1.primaryBonus, sub2.primaryBonus);
    expect(p.classId).toBeUndefined();
    expect(p.subclassId).toBeUndefined();
    expect(p.subclass2Id).toBeUndefined();
    expect(p.primary).toEqual({ str: 0, agi: 0, wit: 0, int: 0 });
  });
});
