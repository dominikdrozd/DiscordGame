import {
  SKILLS,
  getSkill,
  isOnCooldown,
  setCooldown,
  listAvailableSkills,
} from '../../src/modules/game/skills/index.js';
import { makeBattleCombatant, makeBattleState } from '../helpers/factories.js';

describe('skills registry', () => {
  test('every registered skill exposes id, targeting, classes and apply function', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      expect(skill.id).toBe(id);
      expect(typeof skill.name).toBe('string');
      expect(['self', 'ally', 'enemy', 'allEnemies', 'allAllies']).toContain(skill.targeting);
      expect(Array.isArray(skill.classes)).toBe(true);
      expect(typeof skill.apply).toBe('function');
      expect(typeof skill.cooldown).toBe('number');
    }
  });

  test('every skill apply does not throw on baseline state with one caster and one target', () => {
    const caster = makeBattleCombatant({ id: 'caster', team: 0, hp: 100, spellPower: 5 });
    const target = makeBattleCombatant({ id: 'target', team: 1, hp: 100 });
    const state = makeBattleState([caster, target]);
    for (const skill of Object.values(SKILLS)) {
      const targets = skill.targeting === 'self' ? [caster] : [target];
      expect(() => skill.apply(state, caster, targets)).not.toThrow();
    }
  });

  test('getSkill returns Skill for known id and undefined for unknown', () => {
    expect(getSkill('kula_ognia')).toBeDefined();
    expect(getSkill('this_does_not_exist')).toBeUndefined();
  });

  test('isOnCooldown / setCooldown round-trip preserves cooldown', () => {
    const c = makeBattleCombatant({ id: 'me' });
    expect(isOnCooldown(c, 'kula_ognia')).toBe(false);
    setCooldown(c, 'kula_ognia', 3);
    expect(isOnCooldown(c, 'kula_ognia')).toBe(true);
    expect(c.skillCooldowns?.kula_ognia).toBe(3);
  });

  test('listAvailableSkills returns combatant.skills mapped to Skill objects', () => {
    const c = makeBattleCombatant({ id: 'me', skills: ['kula_ognia', 'unknown_id'] });
    const list = listAvailableSkills(c);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('kula_ognia');
  });
});
