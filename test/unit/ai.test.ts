import { chooseAiAction, pickTarget } from '../../src/modules/game/engine/ai.js';
import { makeBattleCombatant, makeBattleState, mockRandom } from '../helpers/factories.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickTarget', () => {
  test('weights by threatBias deterministically with mocked random', () => {
    const tank = makeBattleCombatant({ id: 'tank', team: 1, hp: 100, threatBias: 2 });
    const dps = makeBattleCombatant({ id: 'dps', team: 1, hp: 100 });
    mockRandom([0]); // r = 0 → first iteration consumes weight 3, r becomes -3, returns tank
    expect(pickTarget([tank, dps]).id).toBe('tank');
  });

  test('falls back to second target when r exceeds first weight', () => {
    const a = makeBattleCombatant({ id: 'a', team: 1 });
    const b = makeBattleCombatant({ id: 'b', team: 1 });
    mockRandom([0.7]); // total 2, r=1.4, first iter r=0.4 (>0), second iter r=-0.6 → b
    expect(pickTarget([a, b]).id).toBe('b');
  });
});

describe('chooseAiAction', () => {
  test('returns defend when no enemies alive', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0 });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 0 });
    const state = makeBattleState([me, enemy]);
    expect(chooseAiAction(state, me)).toEqual({ kind: 'defend' });
  });

  test('returns item when hp<30% and potionsLeft>0 with random < 0.6', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, hp: 20, maxHp: 100, potionsLeft: 2 });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 100 });
    const state = makeBattleState([me, enemy]);
    mockRandom([0.5]);
    expect(chooseAiAction(state, me)).toEqual({ kind: 'item' });
  });

  test('skips potion when random >= 0.6 even with low hp', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, hp: 20, maxHp: 100, potionsLeft: 2 });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 100 });
    const state = makeBattleState([me, enemy]);
    // potion=0.7 (skip), defend=0.5 (skip, >=0.2), pickTarget r=0
    mockRandom([0.7, 0.5, 0]);
    const action = chooseAiAction(state, me);
    expect(action.kind).toBe('attack');
  });

  test('returns defend when random < 0.2 (no skills)', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, hp: 100, maxHp: 100 });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 100 });
    const state = makeBattleState([me, enemy]);
    mockRandom([0.1]);
    expect(chooseAiAction(state, me)).toEqual({ kind: 'defend' });
  });

  test('defaults to attack with deterministic random sequence', () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, hp: 100, maxHp: 100 });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 100 });
    const state = makeBattleState([me, enemy]);
    mockRandom([0.5, 0]); // skip defend, pickTarget r=0
    const action = chooseAiAction(state, me);
    expect(action.kind).toBe('attack');
    expect(action.targetId).toBe('e');
  });

  test('returns skill action when skillIds non-empty and skill random < 0.4', () => {
    const me = makeBattleCombatant({
      id: 'me',
      team: 0,
      hp: 100,
      maxHp: 100,
      skills: ['kula_ognia'],
    });
    const enemy = makeBattleCombatant({ id: 'e', team: 1, hp: 100 });
    const state = makeBattleState([me, enemy]);
    // skill=0.3 (<0.4), pickSkillIdx=0, pickTarget r=0
    mockRandom([0.3, 0, 0]);
    const action = chooseAiAction(state, me);
    expect(action.kind).toBe('skill');
    expect(action.skillId).toBe('kula_ognia');
  });
});
