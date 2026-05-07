import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { BattleStore } from '../../src/modules/game/engine/battle-store.js';
import type { BattleState, BattleCombatant } from '../../src/modules/game/engine/battle-state.js';
import { randomUUID } from 'node:crypto';

describe('Ambush recovery — hydrate + persist round across simulated restart', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let store: BattleStore;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 60_000);
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    env = await harness.newEnv();
    store = new BattleStore(env.repos.battle);
  });
  afterEach(async () => {
    await env.cleanup();
  });

  function mkCombatant(id: string, team: number, hp = 100): BattleCombatant {
    return {
      id,
      team,
      controller: team === 0 ? 'human' : 'ai',
      name: `c-${id}`,
      hp,
      maxHp: 100,
      damageBonus: 0,
      defending: false,
      potionsLeft: 0,
    };
  }

  function makeState(combatants: BattleCombatant[], threadId: string): BattleState {
    return {
      _battleId: randomUUID(),
      id: threadId,
      thread: null,
      combatants,
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
    };
  }

  it('loadActive returns persisted battles after simulated restart', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-x');
    state.combatants[0].hp = 60;
    state.roundNumber = 3;
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });

    // simulate restart: new BattleStore on same DB, load active battles
    const store2 = new BattleStore(env.repos.battle);
    const loaded = await store2.loadActive();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].state._battleId).toBe(state._battleId);
    expect(loaded[0].state.combatants[0].hp).toBe(60);
    expect(loaded[0].state.roundNumber).toBe(3);
    expect(loaded[0].state.thread).toBeNull();
    expect(loaded[0].doc.expedition?.destination).toBe('forest');
  });

  it('finished battles do not appear in loadActive', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-x');
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    await store.finish(state._battleId, { winnerTeam: 0 });

    const loaded = await store.loadActive();
    expect(loaded).toHaveLength(0);
  });

  it('updateThreadId persists new thread id after recreate', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-old');
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });

    await store.updateThreadId(state._battleId, 'thread-new');
    const doc = await env.repos.battle.findById(state._battleId);
    expect(doc?.threadId).toBe('thread-new');
    expect(doc?._id).toBe(state._battleId);
  });

  it('snapshot persists pending Map as Record on load', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-x');
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });

    state.pending.set('p1', { kind: 'attack', targetId: 'm1' });
    await store.snapshot(state);

    const loaded = await store.loadActive();
    expect(loaded[0].state.pending.get('p1')).toEqual({ kind: 'attack', targetId: 'm1' });
  });
});
