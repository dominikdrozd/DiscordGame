import {
  routeBattleInteraction,
  handleBattleAction,
  handleBattleTarget,
} from '../../src/modules/game/engine/battle-helpers.js';
import { makeBattleCombatant, makeBattleState } from '../helpers/factories.js';

interface FakeBtn {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  reply: jest.Mock;
  update: jest.Mock;
}

function makeBtn(userId: string, customId: string): FakeBtn {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 't', globalName: 'T' },
    reply: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
}

describe('routeBattleInteraction', () => {
  test('silent return gdy getState zwraca undefined (nie nasza walka)', async () => {
    const btn = makeBtn('a', 'pnl:b1');
    let onChoiceCalled = false;
    await routeBattleInteraction(btn as never, {
      getState: () => undefined,
      onChoiceRecorded: async () => {
        onChoiceCalled = true;
      },
    });
    expect(btn.reply).not.toHaveBeenCalled();
    expect(btn.update).not.toHaveBeenCalled();
    expect(onChoiceCalled).toBe(false);
  });

  test('finished state → ackStaleInteraction (reply z message)', async () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([a]);
    state.id = 'b1';
    state.finished = true;
    const btn = makeBtn('a', 'pnl:b1');
    await routeBattleInteraction(btn as never, { getState: () => state });
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('zakończyła') }),
    );
  });

  test('itmpick: routing + onChoiceRecorded callback', async () => {
    const a = makeBattleCombatant({
      id: 'a',
      team: 0,
      controller: 'human',
      hp: 100,
      consumables: { potion_small: 1 },
    });
    const state = makeBattleState([a]);
    state.id = 'b1';
    state.thread = { send: jest.fn().mockResolvedValue({}) };
    let recordedFor: string | null = null;
    const btn = makeBtn('a', 'itmpick:b1:a:potion_small');
    await routeBattleInteraction(btn as never, {
      getState: () => state,
      onChoiceRecorded: async (_s, combatantId) => {
        recordedFor = combatantId;
      },
    });
    expect(state.pending.has('a')).toBe(true);
    expect(recordedFor).toBe('a');
  });
});

describe('handleBattleAction', () => {
  test('atk z 1 enemy → auto-pick (bez target picker)', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const enemy = makeBattleCombatant({ id: 'enemy:x:1', team: 1, controller: 'ai', hp: 50 });
    const state = makeBattleState([me, enemy]);
    state.id = 'b1';
    let recordedFor: string | null = null;
    const btn = makeBtn('me', 'bat:b1:me:atk');
    await handleBattleAction(btn as never, state, {
      onChoiceRecorded: async (id) => {
        recordedFor = id;
      },
    });
    expect(state.pending.get('me')?.kind).toBe('attack');
    expect(state.pending.get('me')?.targetId).toBe('enemy:x:1');
    expect(recordedFor).toBe('me');
  });

  test('atk z 2+ enemies → target picker (reply z components, no pending yet)', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const e1 = makeBattleCombatant({ id: 'enemy:1', team: 1, controller: 'ai', hp: 30 });
    const e2 = makeBattleCombatant({ id: 'enemy:2', team: 1, controller: 'ai', hp: 30 });
    const state = makeBattleState([me, e1, e2]);
    state.id = 'b1';
    const btn = makeBtn('me', 'bat:b1:me:atk');
    await handleBattleAction(btn as never, state);
    expect(state.pending.has('me')).toBe(false);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Wybierz cel') }),
    );
  });

  test('def → ustawia kind: defend i wywołuje onChoiceRecorded', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([me]);
    state.id = 'b1';
    let called = false;
    const btn = makeBtn('me', 'bat:b1:me:def');
    await handleBattleAction(btn as never, state, {
      onChoiceRecorded: async () => {
        called = true;
      },
    });
    expect(state.pending.get('me')?.kind).toBe('defend');
    expect(called).toBe(true);
  });

  test('niewłaściwy user (combatantId mismatch) → reply z notMineMessage', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([me]);
    state.id = 'b1';
    const btn = makeBtn('intruder', 'bat:b1:me:atk');
    await handleBattleAction(btn as never, state, {
      notMineMessage: 'To nie twój dungeon.',
    });
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'To nie twój dungeon.' }),
    );
    expect(state.pending.has('me')).toBe(false);
  });

  test('martwy gracz (hp=0) → alreadyDeadMessage', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 0 });
    const state = makeBattleState([me]);
    state.id = 'b1';
    const btn = makeBtn('me', 'bat:b1:me:atk');
    await handleBattleAction(btn as never, state, {
      alreadyDeadMessage: 'Już padłeś w arenie.',
    });
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Już padłeś w arenie.' }),
    );
  });

  test('pending już ustawione → reply "Już wybrałeś"', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([me]);
    state.id = 'b1';
    state.pending.set('me', { kind: 'defend' });
    const btn = makeBtn('me', 'bat:b1:me:atk');
    await handleBattleAction(btn as never, state);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Już wybrałeś') }),
    );
  });
});

describe('handleBattleTarget', () => {
  test('wybór celu (atk) → pending = attack + onChoiceRecorded', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const enemy = makeBattleCombatant({ id: 'enemy:x:1', team: 1, controller: 'ai', hp: 50 });
    const state = makeBattleState([me, enemy]);
    state.id = 'b1';
    let called = false;
    const btn = makeBtn('me', 'tgt:b1:me:atk:enemy:x:1');
    await handleBattleTarget(btn as never, state, {
      onChoiceRecorded: async () => {
        called = true;
      },
    });
    expect(state.pending.get('me')?.kind).toBe('attack');
    expect(state.pending.get('me')?.targetId).toBe('enemy:x:1');
    expect(called).toBe(true);
  });

  test('cel padł → fallback do innego live enemy (1 alternatywa → auto)', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const dead = makeBattleCombatant({ id: 'enemy:1', team: 1, controller: 'ai', hp: 0 });
    const alive = makeBattleCombatant({ id: 'enemy:2', team: 1, controller: 'ai', hp: 30 });
    const state = makeBattleState([me, dead, alive]);
    state.id = 'b1';
    const btn = makeBtn('me', 'tgt:b1:me:atk:enemy:1');
    await handleBattleTarget(btn as never, state);
    expect(state.pending.get('me')?.kind).toBe('attack');
    expect(state.pending.get('me')?.targetId).toBe('enemy:2');
  });

  test('cel padł + brak żywych enemy → auto defend', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const dead = makeBattleCombatant({ id: 'enemy:1', team: 1, controller: 'ai', hp: 0 });
    const state = makeBattleState([me, dead]);
    state.id = 'b1';
    const btn = makeBtn('me', 'tgt:b1:me:atk:enemy:1');
    await handleBattleTarget(btn as never, state);
    expect(state.pending.get('me')?.kind).toBe('defend');
  });

  test('niewłaściwy user → reply z notMineMessage', async () => {
    const me = makeBattleCombatant({ id: 'me', team: 0, controller: 'human', hp: 100 });
    const enemy = makeBattleCombatant({ id: 'enemy:1', team: 1, controller: 'ai', hp: 30 });
    const state = makeBattleState([me, enemy]);
    state.id = 'b1';
    const btn = makeBtn('intruder', 'tgt:b1:me:atk:enemy:1');
    await handleBattleTarget(btn as never, state, {
      notMineMessage: 'To nie twój ambush.',
    });
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'To nie twój ambush.' }),
    );
  });
});
