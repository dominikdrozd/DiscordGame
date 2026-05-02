import {
  alive,
  aliveAllies,
  aliveEnemies,
  aliveOnTeam,
  findCombatant,
  humansAlive,
  checkFinish,
} from '../../src/modules/game/engine/battle-state.js';
import { makeBattleCombatant, makeBattleState } from '../helpers/factories.js';

describe('battle-state filters', () => {
  test('alive filters out hp<=0', () => {
    const a = makeBattleCombatant({ id: 'a', hp: 50 });
    const b = makeBattleCombatant({ id: 'b', hp: 0 });
    const state = makeBattleState([a, b]);
    expect(alive(state)).toEqual([a]);
  });

  test('aliveOnTeam returns combatants of given team only when alive', () => {
    const t0a = makeBattleCombatant({ id: 't0a', team: 0, hp: 100 });
    const t0d = makeBattleCombatant({ id: 't0d', team: 0, hp: 0 });
    const t1 = makeBattleCombatant({ id: 't1', team: 1, hp: 30 });
    const state = makeBattleState([t0a, t0d, t1]);
    expect(aliveOnTeam(state, 0)).toEqual([t0a]);
    expect(aliveOnTeam(state, 1)).toEqual([t1]);
  });

  test('aliveAllies/aliveEnemies partition by team', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, hp: 100 });
    const ally = makeBattleCombatant({ id: 'ally', team: 0, hp: 50 });
    const enemy = makeBattleCombatant({ id: 'enemy', team: 1, hp: 30 });
    const state = makeBattleState([me, ally, enemy]);
    expect(aliveAllies(state, me)).toEqual(expect.arrayContaining([me, ally]));
    expect(aliveEnemies(state, me)).toEqual([enemy]);
  });

  test('findCombatant returns by id or undefined', () => {
    const a = makeBattleCombatant({ id: 'a' });
    const b = makeBattleCombatant({ id: 'b' });
    const state = makeBattleState([a, b]);
    expect(findCombatant(state, 'a')).toBe(a);
    expect(findCombatant(state, 'missing')).toBeUndefined();
  });

  test('humansAlive filters human-controllers with hp>0', () => {
    const human = makeBattleCombatant({ id: 'h', controller: 'human', hp: 50 });
    const ai = makeBattleCombatant({ id: 'ai', controller: 'ai', hp: 30 });
    const deadHuman = makeBattleCombatant({ id: 'dh', controller: 'human', hp: 0 });
    const state = makeBattleState([human, ai, deadHuman]);
    expect(humansAlive(state)).toEqual([human]);
  });
});

describe('checkFinish', () => {
  test('reports draw when no team alive', () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, hp: 0 });
    const b = makeBattleCombatant({ id: 'b', team: 1, hp: 0 });
    const state = makeBattleState([a, b]);
    expect(checkFinish(state)).toEqual({ finished: true, draw: true });
  });

  test('reports winnerTeam when only one team alive', () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, hp: 50 });
    const b = makeBattleCombatant({ id: 'b', team: 1, hp: 0 });
    const state = makeBattleState([a, b]);
    expect(checkFinish(state)).toEqual({ finished: true, winnerTeam: 0 });
  });

  test('reports finished:false while multiple teams stand', () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, hp: 50 });
    const b = makeBattleCombatant({ id: 'b', team: 1, hp: 30 });
    const state = makeBattleState([a, b]);
    expect(checkFinish(state)).toEqual({ finished: false });
  });
});
