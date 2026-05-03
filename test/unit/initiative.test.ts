import { resolveBattleRound } from '../../src/modules/game/engine/combat-battle.js';
import { addBuff } from '../../src/modules/game/engine/buffs.js';
import { makeBattleCombatant, makeBattleState, mockRandom } from '../helpers/factories.js';

afterEach(() => jest.restoreAllMocks());

describe('Initiative — szybszy combatant atakuje pierwszy', () => {
  test('przy równym HP/dmg, faster speed → wygrywa', () => {
    const fast = makeBattleCombatant({
      id: 'fast',
      team: 0,
      hp: 8,
      damageBonus: 100,
      speed: 10,
    });
    const slow = makeBattleCombatant({
      id: 'slow',
      team: 1,
      hp: 8,
      damageBonus: 100,
      speed: 1,
    });
    const state = makeBattleState([slow, fast]); // slow pierwszy w array — bez initiative byłby pierwszy
    state.pending.set('fast', { kind: 'attack', targetId: 'slow' });
    state.pending.set('slow', { kind: 'attack', targetId: 'fast' });
    // [pick name=0, dodge=0.99, dmg=0, crit=0.99, pick name=0, dodge=0.99, ...]
    mockRandom([0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(true);
    expect(res.winnerTeam).toBe(0); // fast wygrywa mimo że był drugi w array
    expect(slow.hp).toBe(0);
  });

  test('przy równym speed → tie-break po array order (stabilny)', () => {
    const a = makeBattleCombatant({
      id: 'a',
      team: 0,
      hp: 8,
      damageBonus: 100,
      speed: 5,
    });
    const b = makeBattleCombatant({
      id: 'b',
      team: 1,
      hp: 8,
      damageBonus: 100,
      speed: 5,
    });
    const state = makeBattleState([a, b]);
    state.pending.set('a', { kind: 'attack', targetId: 'b' });
    state.pending.set('b', { kind: 'attack', targetId: 'a' });
    mockRandom([0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(true);
    expect(res.winnerTeam).toBe(0); // a pierwszy w array
  });

  test('slow buff obniża inicjatywę — szybszy ze slow przegrywa z wolniejszym bez slow', () => {
    const wasFast = makeBattleCombatant({
      id: 'wasFast',
      team: 0,
      hp: 8,
      damageBonus: 100,
      speed: 10,
    });
    const slowOpponent = makeBattleCombatant({
      id: 'slowOpp',
      team: 1,
      hp: 8,
      damageBonus: 100,
      speed: 5,
    });
    // wasFast dostaje slow -7 → effective speed = 3 < 5
    addBuff(wasFast, { id: 'tar', kind: 'slow', source: 'rogue', ttl: 2, amount: 7 });

    const state = makeBattleState([wasFast, slowOpponent]);
    state.pending.set('wasFast', { kind: 'attack', targetId: 'slowOpp' });
    state.pending.set('slowOpp', { kind: 'attack', targetId: 'wasFast' });
    mockRandom([0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(true);
    expect(res.winnerTeam).toBe(1); // slowOpponent wygrywa, bo wasFast jest slowed
  });

  test('slow już NIE paraliżuje — combatant wciąż atakuje (tylko później)', () => {
    const slowed = makeBattleCombatant({
      id: 'slowed',
      team: 0,
      hp: 100,
      damageBonus: 50,
      speed: 5,
    });
    const target = makeBattleCombatant({
      id: 'target',
      team: 1,
      hp: 100,
      damageBonus: 0,
      speed: 1,
    });
    addBuff(slowed, { id: 'freeze', kind: 'slow', source: 'mage', ttl: 1, amount: 3 });
    const state = makeBattleState([slowed, target]);
    state.pending.set('slowed', { kind: 'attack', targetId: 'target' });
    mockRandom([0, 0.99, 0, 0.99]);
    resolveBattleRound(state);
    expect(target.hp).toBeLessThan(100); // slowed ATAKOWAŁ pomimo slow buffu
  });
});
