import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { BattleStore } from '../../src/modules/game/engine/battle-store.js';
import type { BattleState, BattleCombatant } from '../../src/modules/game/engine/battle-state.js';
import { randomUUID } from 'node:crypto';

describe('BattleStore', () => {
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

  function makeState(overrides: Partial<BattleState> = {}): BattleState {
    const player: BattleCombatant = {
      id: 'p1',
      team: 0,
      controller: 'human',
      name: 'Alice',
      hp: 100,
      maxHp: 100,
      damageBonus: 0,
      defending: false,
      potionsLeft: 0,
    };
    const mob: BattleCombatant = {
      id: 'm1',
      team: 1,
      controller: 'ai',
      name: 'Goblin',
      hp: 30,
      maxHp: 30,
      damageBonus: 2,
      defending: false,
      potionsLeft: 0,
    };
    return {
      _battleId: randomUUID(),
      id: 'thread-1',
      thread: null,
      combatants: [player, mob],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      ...overrides,
    };
  }

  it('create persists initial battle doc and returns _battleId', async () => {
    const state = makeState();
    const id = await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    expect(id).toBe(state._battleId);
    const doc = await env.repos.battle.findById(id);
    expect(doc?.threadId).toBe('thread-1');
    expect(doc?.combatants).toHaveLength(2);
    expect(doc?.expedition?.destination).toBe('forest');
  });

  it('snapshot upserts current state (HP changes persist)', async () => {
    const state = makeState();
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });

    state.combatants[0].hp = 50;
    state.combatants[1].hp = 0;
    state.roundNumber = 2;
    state.pending.set('p1', { kind: 'attack', targetId: 'm1' });
    await store.snapshot(state);

    const doc = await env.repos.battle.findById(state._battleId);
    expect(doc?.combatants.find((c) => c.id === 'p1')?.hp).toBe(50);
    expect(doc?.combatants.find((c) => c.id === 'm1')?.hp).toBe(0);
    expect(doc?.roundNumber).toBe(2);
    expect(doc?.pending.p1).toEqual({ kind: 'attack', targetId: 'm1' });
  });

  it('finish marks doc finished + sets winnerTeam', async () => {
    const state = makeState();
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    await store.finish(state._battleId, { winnerTeam: 0 });
    const doc = await env.repos.battle.findById(state._battleId);
    expect(doc?.finished).toBe(true);
    expect(doc?.winnerTeam).toBe(0);
  });

  it('loadActive returns only unfinished and converts pending Record→Map', async () => {
    const stateA = makeState();
    const stateB = makeState();
    await store.create(stateA, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    await store.create(stateB, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    await store.finish(stateB._battleId, { draw: true });

    const loaded = await store.loadActive();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].state._battleId).toBe(stateA._battleId);
    expect(loaded[0].state.thread).toBeNull();
    expect(loaded[0].state.pending).toBeInstanceOf(Map);
    expect(loaded[0].doc.type).toBe('ambush');
  });

  it('updateThreadId changes threadId field', async () => {
    const state = makeState();
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });
    await store.updateThreadId(state._battleId, 'thread-2');
    const doc = await env.repos.battle.findById(state._battleId);
    expect(doc?.threadId).toBe('thread-2');
  });
});
