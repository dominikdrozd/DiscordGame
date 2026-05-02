import {
  promptHumansWithPanel,
  handlePanelOpen,
  notifyChoiceMade,
} from '../../src/modules/game/engine/battle-helpers.js';
import {
  makeBattleCombatant,
  makeBattleState,
} from '../helpers/factories.js';

interface FakeThread {
  send: jest.Mock;
  messages: { fetch: jest.Mock };
}

function makeThread(): FakeThread {
  return {
    send: jest.fn().mockImplementation(async (payload: unknown) => {
      void payload;
      return { id: `msg-${Math.random()}` };
    }),
    messages: { fetch: jest.fn().mockResolvedValue(null) },
  };
}

interface FakeBtnInteraction {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  reply: jest.Mock;
}

function makeBtn(userId: string, customId = `pnl:b1`): FakeBtnInteraction {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    reply: jest.fn().mockResolvedValue({}),
  };
}

describe('promptHumansWithPanel', () => {
  test('wysyła pojedynczą wiadomość z panel-opener buttonem i zapisuje pod __panel__', async () => {
    const thread = makeThread();
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
    const b = makeBattleCombatant({ id: 'b', team: 1, controller: 'human', hp: 100 });
    const state = makeBattleState([a, b]);
    state.thread = thread;

    await promptHumansWithPanel(state);

    expect(thread.send).toHaveBeenCalledTimes(1);
    const payload: unknown = thread.send.mock.calls[0][0];
    if (!payload || typeof payload !== 'object') throw new Error('no payload');
    if (!('content' in payload) || typeof payload.content !== 'string') throw new Error();
    expect(payload.content).toContain('<@a>');
    expect(payload.content).toContain('<@b>');
    expect(payload.content).toContain('Otwórz panel');
    expect(state.promptMessageIds.has('__panel__')).toBe(true);
  });

  test('skip gdy nie ma żywych humans (np. tylko AI)', async () => {
    const thread = makeThread();
    const ai = makeBattleCombatant({ id: 'enemy', team: 1, controller: 'ai', hp: 100 });
    const state = makeBattleState([ai]);
    state.thread = thread;
    await promptHumansWithPanel(state);
    expect(thread.send).not.toHaveBeenCalled();
  });

  test('pomija nieżywych humans z mention listy', async () => {
    const thread = makeThread();
    const dead = makeBattleCombatant({ id: 'dead', team: 0, controller: 'human', hp: 0 });
    const alive = makeBattleCombatant({ id: 'alive', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([dead, alive]);
    state.thread = thread;
    await promptHumansWithPanel(state);
    const payload: unknown = thread.send.mock.calls[0]?.[0];
    if (!payload || typeof payload !== 'object' || !('content' in payload)) throw new Error();
    if (typeof payload.content !== 'string') throw new Error();
    expect(payload.content).toContain('<@alive>');
    expect(payload.content).not.toContain('<@dead>');
  });
});

describe('handlePanelOpen', () => {
  test('odrzuca user który nie jest w walce', async () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([a]);
    const btn = makeBtn('outsider');
    await handlePanelOpen(btn as never, state);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Nie bierzesz udziału') }),
    );
  });

  test('odrzuca martwego gracza', async () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 0 });
    const state = makeBattleState([a]);
    const btn = makeBtn('a');
    await handlePanelOpen(btn as never, state);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Już nie żyjesz') }),
    );
  });

  test('odrzuca gracza który już wybrał akcję', async () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
    const state = makeBattleState([a]);
    state.pending.set('a', { kind: 'defend' });
    const btn = makeBtn('a');
    await handlePanelOpen(btn as never, state);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Już wybrałeś') }),
    );
  });

  test('happy path renderuje ephemeral action picker', async () => {
    const a = makeBattleCombatant({
      id: 'a',
      team: 0,
      controller: 'human',
      hp: 80,
      maxHp: 100,
    });
    const state = makeBattleState([a]);
    const btn = makeBtn('a');
    await handlePanelOpen(btn as never, state);
    expect(btn.reply).toHaveBeenCalledTimes(1);
    const payload: unknown = btn.reply.mock.calls[0][0];
    if (!payload || typeof payload !== 'object') throw new Error();
    if ('ephemeral' in payload) expect(payload.ephemeral).toBe(true);
    if ('content' in payload && typeof payload.content === 'string') {
      expect(payload.content).toContain('80/100 HP');
    }
    if ('components' in payload && Array.isArray(payload.components)) {
      expect(payload.components).toHaveLength(1);
    }
  });
});

describe('notifyChoiceMade', () => {
  test('wysyła publiczny komunikat ✅ z imieniem combatanta', async () => {
    const thread = makeThread();
    const a = makeBattleCombatant({
      id: 'a',
      team: 0,
      controller: 'human',
      hp: 100,
      name: 'Alice',
    });
    const state = makeBattleState([a]);
    state.thread = thread;
    await notifyChoiceMade(state, 'a');
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('Alice'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('wybrał akcję'));
  });

  test('skip dla nieznanego combatantId', async () => {
    const thread = makeThread();
    const state = makeBattleState([]);
    state.thread = thread;
    await notifyChoiceMade(state, 'nieznany');
    expect(thread.send).not.toHaveBeenCalled();
  });

  test('treść NIE zawiera szczegółów akcji (cel/skill/item)', async () => {
    const thread = makeThread();
    const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100, name: 'Alice' });
    const state = makeBattleState([a]);
    state.thread = thread;
    state.pending.set('a', { kind: 'attack', targetId: 'enemy_secret' });
    await notifyChoiceMade(state, 'a');
    const sent: unknown = thread.send.mock.calls[0]?.[0];
    expect(typeof sent).toBe('string');
    if (typeof sent === 'string') {
      expect(sent).not.toContain('attack');
      expect(sent).not.toContain('enemy_secret');
    }
  });
});
