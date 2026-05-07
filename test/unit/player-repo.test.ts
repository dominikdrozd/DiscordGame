import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { PlayerRepo, type PlayerDoc } from '../../src/persistence/repos/player.repo.js';

describe('PlayerRepo', () => {
  let mem: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let repo: PlayerRepo;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    client = await MongoClient.connect(mem.getUri());
  }, 60_000);
  afterAll(async () => {
    await client.close();
    await mem.stop();
  });
  beforeEach(() => {
    db = client.db(`test-${randomUUID()}`);
    repo = new PlayerRepo(db.collection('players'));
  });

  // TODO Task 7: po usunięciu `inventory.items` z PlayerStats, wywal `items: []` z seeda
  const seed = (id: string): PlayerDoc => ({
    _id: id,
    id,
    name: `player-${id}`,
    xp: 0,
    level: 1,
    gold: 0,
    wins: 0,
    losses: 0,
    duels: 0,
    inventory: { resources: {}, items: [] },
    equipped: {},
    skills: {
      mining: { level: 1, xp: 0 },
      fishing: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      combat: { level: 1, xp: 0 },
    },
    unspentPoints: 0,
    attribute: { attack: 0, defense: 0, hp: 0, crit: 0 },
    primary: { str: 0, agi: 0, wit: 0, int: 0 },
    learnedSkills: [],
    unlearnedBooks: [],
    quests: { active: [], completed: [], abandoned: [] },
    cooldowns: {},
  });

  it('upsert + findAll returns inserted players', async () => {
    await repo.upsert(seed('a'));
    await repo.upsert(seed('b'));
    const all = await repo.findAll();
    expect(all.map((p) => p._id).sort()).toEqual(['a', 'b']);
  });

  it('upsert overwrites existing doc by _id', async () => {
    await repo.upsert(seed('a'));
    const updated = { ...seed('a'), gold: 999 };
    await repo.upsert(updated);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].gold).toBe(999);
  });

  it('count returns number of docs', async () => {
    expect(await repo.count()).toBe(0);
    await repo.upsert(seed('a'));
    expect(await repo.count()).toBe(1);
  });

  it('insertMany inserts batch', async () => {
    await repo.insertMany([seed('a'), seed('b'), seed('c')]);
    expect(await repo.count()).toBe(3);
  });
});
