import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { migrateLegacyJsonIfNeeded } from '../../src/persistence/migrate-legacy.js';

interface LegacyItem {
  uid: string;
  baseId: string;
  rarity: string;
  name: string;
  stats: { attack?: number };
}

interface LegacyPlayer {
  id: string;
  name: string;
  xp: number;
  level: number;
  gold: number;
  wins: number;
  losses: number;
  duels: number;
  inventory: { resources: Record<string, number>; items: LegacyItem[] };
  equipped: { weapon?: string; armor?: string; tool?: string };
  skills: Record<string, { level: number; xp: number }>;
  unspentPoints: number;
  attribute: { attack: number; defense: number; hp: number; crit: number };
  primary: { str: number; agi: number; wit: number; int: number };
  learnedSkills: string[];
  unlearnedBooks: string[];
  quests: { active: string[]; completed: string[]; abandoned: string[] };
  cooldowns: Record<string, number>;
}

function samplePlayer(id: string, items: { uid: string; baseId: string }[] = []): LegacyPlayer {
  return {
    id,
    name: id,
    xp: 0,
    level: 1,
    gold: 100,
    wins: 0,
    losses: 0,
    duels: 0,
    inventory: {
      resources: { wood: 5 },
      items: items.map((i) => ({
        uid: i.uid,
        baseId: i.baseId,
        rarity: 'common',
        name: 'X',
        stats: { attack: 1 },
      })),
    },
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
  };
}

describe('migrateLegacyJsonIfNeeded', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let tmpRoot: string;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 60_000);
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    env = await harness.newEnv();
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'migrate-test-'));
  });
  afterEach(async () => {
    await env.cleanup();
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('migrates per-player JSON files', async () => {
    const dir = path.join(tmpRoot, 'players');
    fs.mkdirSync(dir);
    writeFileSync(
      path.join(dir, 'alice.json'),
      JSON.stringify(samplePlayer('alice', [{ uid: 'u1', baseId: 'sword' }])),
    );
    writeFileSync(
      path.join(dir, 'bob.json'),
      JSON.stringify(samplePlayer('bob', [{ uid: 'u2', baseId: 'shield' }])),
    );

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(2);
    const aliceItems = await env.repos.item.findByUserId('alice');
    expect(aliceItems.map((i) => i._id)).toEqual(['u1']);
    expect(existsSync(dir)).toBe(false);
    const renamed = fs.readdirSync(tmpRoot).find((f) => f.startsWith('players.migrated-'));
    expect(renamed).toBeDefined();
  });

  it('migrates monolith data/players.json', async () => {
    writeFileSync(
      path.join(tmpRoot, 'players.json'),
      JSON.stringify([
        samplePlayer('alice', [{ uid: 'u1', baseId: 'sword' }]),
        samplePlayer('bob'),
      ]),
    );

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(2);
    expect(await env.repos.item.findByUserId('alice')).toHaveLength(1);
    expect(existsSync(path.join(tmpRoot, 'players.json'))).toBe(false);
  });

  it('skips migration if Mongo already has players', async () => {
    await env.repos.player.upsert({
      _id: 'alice',
      id: 'alice',
      name: 'alice',
      xp: 0,
      level: 1,
      gold: 100,
      wins: 0,
      losses: 0,
      duels: 0,
      inventory: { resources: {} },
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

    fs.mkdirSync(path.join(tmpRoot, 'players'));
    writeFileSync(
      path.join(tmpRoot, 'players', 'bob.json'),
      JSON.stringify(samplePlayer('bob')),
    );

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(1);
    expect(existsSync(path.join(tmpRoot, 'players'))).toBe(true);
  });

  it('skips migration if no legacy files', async () => {
    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);
    expect(await env.repos.player.count()).toBe(0);
  });

  it('throws on duplicate item uids across players', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'players'));
    writeFileSync(
      path.join(tmpRoot, 'players', 'alice.json'),
      JSON.stringify(samplePlayer('alice', [{ uid: 'dup', baseId: 'sword' }])),
    );
    writeFileSync(
      path.join(tmpRoot, 'players', 'bob.json'),
      JSON.stringify(samplePlayer('bob', [{ uid: 'dup', baseId: 'shield' }])),
    );

    await expect(migrateLegacyJsonIfNeeded(env.repos, tmpRoot)).rejects.toThrow(
      /duplicate item uids/,
    );
  });
});
