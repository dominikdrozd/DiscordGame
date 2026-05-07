import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { type BattleDoc, type BattleType } from '../../src/persistence/repos/battle.repo.js';
import { randomUUID } from 'node:crypto';

describe('BattleRepo', () => {
  let harness: TestHarness;
  let env: TestEnv;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 60_000);
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    env = await harness.newEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  function seedDoc(overrides: Partial<BattleDoc> = {}): BattleDoc {
    return {
      _id: overrides._id ?? randomUUID(),
      type: 'ambush' as BattleType,
      threadId: 'thread-1',
      parentChannelId: 'chan-1',
      combatants: [
        {
          id: 'p1',
          team: 0,
          controller: 'human',
          name: 'Alice',
          hp: 100,
          maxHp: 100,
          damageBonus: 0,
          defending: false,
          potionsLeft: 0,
        },
      ],
      pending: {},
      roundNumber: 1,
      finished: false,
      playerIds: ['p1'],
      expedition: { destination: 'forest', channelId: 'chan-1' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  it('upsert + findById', async () => {
    const doc = seedDoc();
    await env.repos.battle.upsert(doc);
    const got = await env.repos.battle.findById(doc._id);
    expect(got?._id).toBe(doc._id);
    expect(got?.type).toBe('ambush');
  });

  it('findActive returns only finished:false', async () => {
    await env.repos.battle.upsert(seedDoc({ finished: false }));
    await env.repos.battle.upsert(seedDoc({ finished: true }));
    const active = await env.repos.battle.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].finished).toBe(false);
  });

  it('updateThreadId mutates threadId field only', async () => {
    const doc = seedDoc({ threadId: 'old-thread' });
    await env.repos.battle.upsert(doc);
    await env.repos.battle.updateThreadId(doc._id, 'new-thread');
    const got = await env.repos.battle.findById(doc._id);
    expect(got?.threadId).toBe('new-thread');
    expect(got?.combatants).toHaveLength(1);
  });

  it('markFinished sets finished + winnerTeam', async () => {
    const doc = seedDoc();
    await env.repos.battle.upsert(doc);
    await env.repos.battle.markFinished(doc._id, { winnerTeam: 0 });
    const got = await env.repos.battle.findById(doc._id);
    expect(got?.finished).toBe(true);
    expect(got?.winnerTeam).toBe(0);
  });

  it('markFinished with draw', async () => {
    const doc = seedDoc();
    await env.repos.battle.upsert(doc);
    await env.repos.battle.markFinished(doc._id, { draw: true });
    const got = await env.repos.battle.findById(doc._id);
    expect(got?.finished).toBe(true);
    expect(got?.draw).toBe(true);
  });

  it('createIndexes idempotent', async () => {
    await env.repos.battle.createIndexes();
    await env.repos.battle.createIndexes();
    expect(true).toBe(true);
  });
});
