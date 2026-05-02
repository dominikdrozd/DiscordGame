import { TIER_MULTIPLIERS } from '../../src/modules/game/mobs/mob.js';
import { KitchenRat } from '../../src/modules/game/mobs/kitchen-rat.mob.js';
import { IronTitan } from '../../src/modules/game/mobs/iron-titan.mob.js';
import { GoblinCook } from '../../src/modules/game/mobs/goblin-cook.mob.js';
import { ScrapGoblin } from '../../src/modules/game/mobs/scrap-goblin.mob.js';

describe('Mob.toCombatant', () => {
  test('scales hp and damageBonus by TIER_MULTIPLIERS[tier]', () => {
    const titan = new IronTitan();
    const c = titan.toCombatant();
    expect(titan.tier).toBe(5);
    expect(c.hp).toBe(Math.round(titan.hp * TIER_MULTIPLIERS[5]));
    expect(c.damageBonus).toBe(Math.round(titan.damageBonus * TIER_MULTIPLIERS[5]));
  });

  test('tier 1 mob keeps base stats unchanged', () => {
    const rat = new KitchenRat();
    const c = rat.toCombatant();
    expect(c.hp).toBe(rat.hp);
    expect(c.damageBonus).toBe(rat.damageBonus);
  });

  test('setTier returns same instance for chaining and mutates tier', () => {
    const rat = new KitchenRat();
    const ret = rat.setTier(3);
    expect(ret).toBe(rat);
    expect(rat.tier).toBe(3);
    const c = rat.toCombatant();
    expect(c.hp).toBe(Math.round(rat.hp * TIER_MULTIPLIERS[3]));
  });

  test('toCombatant with suffix produces unique id and #suffix in name', () => {
    const rat = new KitchenRat();
    const c = rat.toCombatant('xyz');
    expect(c.id).toBe('enemy:szczur_kuchenny:xyz');
    expect(c.name).toContain('#xyz');
  });

  test('toCombatant carries skills array and attackLines when defined', () => {
    const cook = new GoblinCook();
    const c = cook.toCombatant();
    expect(c.skills).toEqual(['cios_w_plecy']);
    expect(c.attackLines).toEqual(expect.arrayContaining(['Plask Rondlem']));
    expect(c.skillCooldowns).toEqual({});
  });

  test('toCombatant returns undefined skills when mob has no skills', () => {
    const goblin = new ScrapGoblin();
    const c = goblin.toCombatant();
    expect(c.skills).toBeUndefined();
    expect(c.skillCooldowns).toBeUndefined();
  });

  test('toCombatant scales defenseBonus when declared', () => {
    const cook = new GoblinCook();
    cook.setTier(2);
    const c = cook.toCombatant();
    expect(c.defenseBonus).toBe(Math.round(1 * TIER_MULTIPLIERS[2]));
  });
});
