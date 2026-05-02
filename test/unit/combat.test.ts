import {
  applyAttack,
  applyDefend,
  applyPotion,
  applyItem,
  POTION_HEAL,
} from '../../src/modules/game/engine/combat.js';
import { addBuff } from '../../src/modules/game/engine/buffs.js';
import { makeCombatant, mockRandom } from '../helpers/factories.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('applyAttack', () => {
  test('returns dodge line when random < DODGE_CHANCE', () => {
    // [pick attack name, dodge check, pick dodge name]
    mockRandom([0, 0.05, 0]);
    const a = makeCombatant({ name: 'A', damageBonus: 0 });
    const b = makeCombatant({ name: 'B', hp: 100 });
    const line = applyAttack(a, b);
    expect(line).toContain('unika');
    expect(b.hp).toBe(100);
  });

  test('uses attacker.attackLines when present instead of global ATTACK_NAMES', () => {
    mockRandom([0, 0.05, 0]);
    const a = makeCombatant({ name: 'A', attackLines: ['Custom Strike'] });
    const b = makeCombatant({ name: 'B' });
    const line = applyAttack(a, b);
    expect(line).toContain('Custom Strike');
  });

  test('applies CRIT_MULTIPLIER when random < CRIT_CHANCE', () => {
    // [pick name, dodge=0.99, dmg roll=0, crit=0.05]
    mockRandom([0, 0.99, 0, 0.05]);
    const a = makeCombatant({ damageBonus: 0 });
    const b = makeCombatant({ hp: 100, defenseBonus: 0 });
    applyAttack(a, b);
    // base dmg = 10 + 0 + 0 = 10, crit ×2 = 20
    expect(b.hp).toBe(80);
  });

  test('reduces damage by defenseBonus + getDefenseAmp', () => {
    mockRandom([0, 0.99, 0, 0.99]);
    const a = makeCombatant({ damageBonus: 0 });
    const b = makeCombatant({ hp: 100, defenseBonus: 3 });
    addBuff(b, { id: 'def', kind: 'defense_amp', source: 's', ttl: 1, amount: 2 });
    applyAttack(a, b);
    // baseDmg = 10, totalDef = 3+2=5, dmg = 10-5=5
    expect(b.hp).toBe(95);
  });

  test('damage floor is 1 when defense exceeds base damage', () => {
    mockRandom([0, 0.99, 0, 0.99]);
    const a = makeCombatant({ damageBonus: 0 });
    const b = makeCombatant({ hp: 100, defenseBonus: 999 });
    applyAttack(a, b);
    expect(b.hp).toBe(99); // dmg clamped at 1
  });
});

describe('applyDefend', () => {
  test('sets defending true and returns flavor line', () => {
    mockRandom([0]);
    const c = makeCombatant({ name: 'D', defending: false });
    const line = applyDefend(c);
    expect(c.defending).toBe(true);
    expect(line).toContain('D');
  });
});

describe('applyPotion', () => {
  test('heals POTION_HEAL capped at maxHp and decrements potionsLeft', () => {
    mockRandom([0]);
    const c = makeCombatant({ hp: 50, maxHp: 100, potionsLeft: 2 });
    applyPotion(c);
    expect(c.hp).toBe(50 + POTION_HEAL);
    expect(c.potionsLeft).toBe(1);
  });

  test('caps heal at maxHp', () => {
    mockRandom([0]);
    const c = makeCombatant({ hp: 95, maxHp: 100, potionsLeft: 1 });
    applyPotion(c);
    expect(c.hp).toBe(100);
  });

  test('returns empty-flask message when potionsLeft is 0', () => {
    const c = makeCombatant({ hp: 50, maxHp: 100, potionsLeft: 0 });
    const line = applyPotion(c);
    expect(line).toContain('flaszka pusta');
    expect(c.hp).toBe(50);
  });
});

describe('applyItem', () => {
  test('decrements consumables and heals on potion_small', () => {
    mockRandom([0]);
    const c = makeCombatant({ hp: 40, maxHp: 100, consumables: { potion_small: 2 } });
    applyItem(c, 'potion_small');
    expect(c.hp).toBe(40 + POTION_HEAL);
    expect(c.consumables?.potion_small).toBe(1);
  });

  test('returns empty message when no free uses and no inventory potions', () => {
    const c = makeCombatant({ hp: 50, potionsLeft: 0, consumables: {} });
    const line = applyItem(c, 'potion_small');
    expect(line).toContain('flaszka pusta');
    expect(c.hp).toBe(50);
  });

  test('unknown item id consumes one but no special effect', () => {
    const c = makeCombatant({ hp: 50, consumables: { magic_dust: 3 } });
    const line = applyItem(c, 'magic_dust');
    expect(c.consumables?.magic_dust).toBe(2);
    expect(line).toContain('efekt nieznany');
  });
});
