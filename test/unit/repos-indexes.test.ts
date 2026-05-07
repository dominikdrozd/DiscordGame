import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { makeRepos, ensureIndexes } from '../../src/persistence/repos/index.js';

describe('repos/index', () => {
  let mem: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    client = await MongoClient.connect(mem.getUri());
  }, 60_000);
  afterAll(async () => {
    await client.close();
    await mem.stop();
  });

  it('makeRepos returns player + item repos', () => {
    const db = client.db(`test-${randomUUID()}`);
    const repos = makeRepos(db);
    expect(repos.player).toBeDefined();
    expect(repos.item).toBeDefined();
  });

  it('ensureIndexes creates items.userId index', async () => {
    const db = client.db(`test-${randomUUID()}`);
    const repos = makeRepos(db);
    await ensureIndexes(repos);
    const itemIndexes = await db.collection('items').indexes();
    const userIdIndex = itemIndexes.find((idx) => idx.key?.userId === 1);
    expect(userIdIndex).toBeDefined();
  });

  it('ensureIndexes is idempotent (callable twice)', async () => {
    const db = client.db(`test-${randomUUID()}`);
    const repos = makeRepos(db);
    await ensureIndexes(repos);
    await ensureIndexes(repos);
    expect(true).toBe(true);
  });
});
