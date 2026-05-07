import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { BattleStore } from '../../src/modules/game/engine/battle-store.js';
import type { BattleState, BattleCombatant } from '../../src/modules/game/engine/battle-state.js';
import { randomUUID } from 'node:crypto';

describe('Multi-type battle persistence', () => {
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

  function makeState(combatants: BattleCombatant[]): BattleState {
    return {
      _battleId: randomUUID(),
      id: 'thread-x',
      thread: null,
      combatants,
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
    };
  }

  it('dungeon battle persists context across simulated restart', async () => {
    const state = makeState([
      mkCombatant('p1', 0),
      mkCombatant('p2', 0),
      mkCombatant('boss-room0', 1),
    ]);
    await store.create(state, 'dungeon', {
      parentChannelId: 'chan-1',
      dungeonContext: {
        dungeonId: 'd-1',
        roomIndex: 0,
        currentBossId: 'boss-room0',
        partyMemberIds: ['p1', 'p2'],
      },
    });

    state.combatants[0].hp = 70;
    state.roundNumber = 4;
    await store.snapshot(state);

    const store2 = new BattleStore(env.repos.battle);
    const loaded = await store2.loadActive();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].doc.type).toBe('dungeon');
    expect(loaded[0].doc.dungeonContext?.dungeonId).toBe('d-1');
    expect(loaded[0].doc.dungeonContext?.partyMemberIds).toEqual(['p1', 'p2']);
    expect(loaded[0].state.combatants[0].hp).toBe(70);
    expect(loaded[0].state.roundNumber).toBe(4);
  });

  it('boss battle persists bossContext', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('boss', 1, 500)]);
    await store.create(state, 'boss', {
      parentChannelId: 'chan-1',
      bossContext: { bossId: 'frostlord' },
    });

    const loaded = await store.loadActive();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].doc.type).toBe('boss');
    expect(loaded[0].doc.bossContext?.bossId).toBe('frostlord');
  });

  it('world-boss battle persists participants', async () => {
    const state = makeState([
      mkCombatant('p1', 0),
      mkCombatant('p2', 0),
      mkCombatant('p3', 0),
      mkCombatant('worldboss', 1, 9999),
    ]);
    await store.create(state, 'worldBoss', {
      parentChannelId: 'chan-1',
      worldBossContext: { bossId: 'titan', participantIds: ['p1', 'p2', 'p3'] },
    });

    const loaded = await store.loadActive();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].doc.type).toBe('worldBoss');
    expect(loaded[0].doc.worldBossContext?.participantIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('finish removes battle from active list across types', async () => {
    const a = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)]);
    await store.create(a, 'dungeon', {
      parentChannelId: 'chan-1',
      dungeonContext: {
        dungeonId: 'd',
        roomIndex: 0,
        currentBossId: 'm1',
        partyMemberIds: ['p1'],
      },
    });
    const b = makeState([mkCombatant('p1', 0), mkCombatant('boss', 1)]);
    await store.create(b, 'boss', {
      parentChannelId: 'chan-1',
      bossContext: { bossId: 'x' },
    });

    expect(await store.loadActive()).toHaveLength(2);
    await store.finish(a._battleId, { winnerTeam: 0 });
    expect(await store.loadActive()).toHaveLength(1);
    await store.finish(b._battleId, { draw: true });
    expect(await store.loadActive()).toHaveLength(0);
  });
});
