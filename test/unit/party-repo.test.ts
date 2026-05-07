import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { type PartyDoc } from '../../src/persistence/repos/party.repo.js';

describe('PartyRepo', () => {
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

  function seed(id: string, members: string[] = ['leader']): PartyDoc {
    return {
      _id: id,
      id,
      leaderId: members[0],
      members,
      pendingInvites: [],
      createdAt: Date.now(),
    };
  }

  it('upsert + findAll', async () => {
    await env.repos.party.upsert(seed('p1'));
    await env.repos.party.upsert(seed('p2'));
    const all = await env.repos.party.findAll();
    expect(all.map((p) => p._id).sort()).toEqual(['p1', 'p2']);
  });

  it('upsert overwrites by _id', async () => {
    await env.repos.party.upsert(seed('p1', ['a']));
    await env.repos.party.upsert({ ...seed('p1', ['a']), members: ['a', 'b'] });
    const got = await env.repos.party.findAll();
    expect(got[0].members).toEqual(['a', 'b']);
  });

  it('deleteOne removes party', async () => {
    await env.repos.party.upsert(seed('p1'));
    await env.repos.party.deleteOne('p1');
    expect(await env.repos.party.findAll()).toHaveLength(0);
  });

  it('insertMany batch', async () => {
    await env.repos.party.insertMany([seed('p1'), seed('p2'), seed('p3')]);
    expect(await env.repos.party.findAll()).toHaveLength(3);
  });

  it('createIndexes idempotent', async () => {
    await env.repos.party.createIndexes();
    await env.repos.party.createIndexes();
    expect(true).toBe(true);
  });
});
