import {
  applyBuffsAtRoundEnd,
  consumeShield,
  addBuff,
  getDamageAmp,
  getDefenseAmp,
  decrementCooldowns,
  isControlled,
} from '../../src/modules/game/engine/buffs.js';
import { makeCombatant } from '../helpers/factories.js';

describe('applyBuffsAtRoundEnd', () => {
  test('applies dot damage and decrements ttl', () => {
    const c = makeCombatant({ hp: 50, maxHp: 100 });
    addBuff(c, { id: 'poison', kind: 'dot', source: 'snake', ttl: 2, amount: 10 });
    const lines = applyBuffsAtRoundEnd(c);
    expect(c.hp).toBe(40);
    expect(c.buffs?.[0]?.ttl).toBe(1);
    expect(lines.length).toBeGreaterThan(0);
  });

  test('applies hot heal capped at maxHp', () => {
    const c = makeCombatant({ hp: 95, maxHp: 100 });
    addBuff(c, { id: 'regen', kind: 'hot', source: 'druid', ttl: 1, amount: 20 });
    applyBuffsAtRoundEnd(c);
    expect(c.hp).toBe(100);
  });

  test('removes expired buffs after ttl reaches zero', () => {
    const c = makeCombatant({ hp: 100 });
    addBuff(c, { id: 'tmp', kind: 'damage_amp', source: 't', ttl: 1, amount: 5 });
    applyBuffsAtRoundEnd(c);
    expect(c.buffs).toHaveLength(0);
  });
});

describe('consumeShield', () => {
  test('absorbs damage up to shield amount and removes shield when depleted', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'shield', kind: 'shield', source: 'cleric', ttl: 3, amount: 30 });
    const r = consumeShield(c, 50);
    expect(r.absorbed).toBe(30);
    expect(r.remaining).toBe(20);
    expect(c.buffs).toHaveLength(0);
  });

  test('partial absorb keeps shield with reduced amount', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'shield', kind: 'shield', source: 'cleric', ttl: 3, amount: 30 });
    const r = consumeShield(c, 10);
    expect(r.absorbed).toBe(10);
    expect(r.remaining).toBe(0);
    expect(c.buffs?.[0]?.amount).toBe(20);
  });

  test('no shield → all damage passes through', () => {
    const c = makeCombatant();
    const r = consumeShield(c, 25);
    expect(r.absorbed).toBe(0);
    expect(r.remaining).toBe(25);
  });
});

describe('addBuff', () => {
  test('refreshes ttl when same id present without duplicating', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'taunt', kind: 'taunt', source: 't', ttl: 1 });
    addBuff(c, { id: 'taunt', kind: 'taunt', source: 't', ttl: 3 });
    expect(c.buffs).toHaveLength(1);
    expect(c.buffs?.[0]?.ttl).toBe(3);
  });

  test('keeps higher ttl when refresh is shorter', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'x', kind: 'damage_amp', source: 'a', ttl: 5, amount: 5 });
    addBuff(c, { id: 'x', kind: 'damage_amp', source: 'a', ttl: 2, amount: 8 });
    expect(c.buffs?.[0]?.ttl).toBe(5);
    expect(c.buffs?.[0]?.amount).toBe(8);
  });
});

describe('getDamageAmp / getDefenseAmp', () => {
  test('sums amounts of all matching kind buffs', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'a', kind: 'damage_amp', source: 's', ttl: 1, amount: 5 });
    addBuff(c, { id: 'b', kind: 'damage_amp', source: 's', ttl: 1, amount: 3 });
    addBuff(c, { id: 'c', kind: 'defense_amp', source: 's', ttl: 1, amount: 7 });
    expect(getDamageAmp(c)).toBe(8);
    expect(getDefenseAmp(c)).toBe(7);
  });

  test('returns 0 when no buffs at all', () => {
    const c = makeCombatant();
    expect(getDamageAmp(c)).toBe(0);
    expect(getDefenseAmp(c)).toBe(0);
  });
});

describe('decrementCooldowns', () => {
  test('ticks down and removes zero-cooldown entries', () => {
    const c = makeCombatant();
    c.skillCooldowns = { fireball: 2, heal: 1 };
    decrementCooldowns(c);
    expect(c.skillCooldowns).toEqual({ fireball: 1 });
  });

  test('no-op when no skillCooldowns', () => {
    const c = makeCombatant();
    expect(() => decrementCooldowns(c)).not.toThrow();
  });
});

describe('isControlled', () => {
  test('detects slow buff as controlling', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'freeze', kind: 'slow', source: 'mage', ttl: 1 });
    expect(isControlled(c)).toBe(true);
  });

  test('returns false when no slow', () => {
    const c = makeCombatant();
    addBuff(c, { id: 'shield', kind: 'shield', source: 's', ttl: 1, amount: 5 });
    expect(isControlled(c)).toBe(false);
  });
});
