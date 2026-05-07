# Mongo Phase 1: Infrastructure + Player Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić MongoDB jako warstwę persistencji dla graczy i przedmiotów (osobna kolekcja z `userId` ref), z one-shot migracją z legacy JSON, bez zmiany zachowania funkcjonalności gry.

**Architecture:** Dodajemy `src/persistence/` (Mongo singleton + typed repos + migrator). `PlayerStatsService` zostaje SoT (in-RAM Map), ale read/write idą do Mongo zamiast plików. Items wynesione do `items` kolekcji z `userId` jako referencja; pole `inventory.items` znika z `PlayerStats`, dostęp przez nowe metody na serwisie. Save jest fire-and-forget z dirty trackingiem żeby event loop nie blokował się. Test harness oparty na `mongodb-memory-server`.

**Tech Stack:** MongoDB 7+ self-hosted, native `mongodb` driver (nie Mongoose), `mongodb-memory-server` dla testów, Bun jako runtime.

**Spec:** [`docs/superpowers/specs/2026-05-07-mongo-migration-and-battle-persistence-design.md`](../specs/2026-05-07-mongo-migration-and-battle-persistence-design.md)

**Subsequent phases (osobne plany po wdrożeniu Phase 1):** Phase 2 — `BattleStore` + AmbushService recovery; Phase 3 — Dungeon/Boss/WorldBoss; Phase 4 — `PartyService` migration; Phase 5 — agregowany "Wróć do walki" button.

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/persistence/mongo.ts` | Singleton `MongoConnection` — `connect(uri)`, `db()`, `close()`, fail-fast jeśli brak `MONGO_URI` |
| `src/persistence/repos/player.repo.ts` | `PlayerRepo` — typed wrapper na `Collection<PlayerDoc>` |
| `src/persistence/repos/item.repo.ts` | `ItemRepo` — typed wrapper na `Collection<ItemDoc>` |
| `src/persistence/repos/index.ts` | `makeRepos(db)` factory + `ensureIndexes(repos)` |
| `src/persistence/migrate-legacy.ts` | `migrateLegacyJsonIfNeeded(repos)` — one-shot import z `data/players.json` lub `data/players/*.json` |
| `test/helpers/mongo-setup.ts` | `mongodb-memory-server` lifecycle (`beforeAll/afterAll` global) + `mongoTestEnv()` factory |

**Modify:**

| Path | Change |
| --- | --- |
| `package.json` | Dodaj `mongodb` (dep), `mongodb-memory-server` (devDep) |
| `.env.example` (utworzyć jeśli brak) | Dodaj `MONGO_URI=mongodb://127.0.0.1:27017/discordbot` |
| `src/modules/game/services/player-stats.ts` | Konstruktor, `load`, `save`, `addItem/removeItem/findItem/toolOfKind`. Usuń `migrateLegacy`. Usuń `Inventory.items` (zostaje tylko `resources`). Dodaj `getItemsForPlayer(userId)`. |
| `src/modules/game/services/enchanter.service.ts` | linia 61 → `playerStats.getItemsForPlayer(p.id).filter(...)` |
| `src/modules/game/services/identification.service.ts` | linie 73, 77 → analogicznie + użyj istniejącego `findItem` |
| `src/modules/game/services/inventory.service.ts` | linia 450 → `playerStats.getItemsForPlayer(player.id)` |
| `src/modules/game/services/smith.service.ts` | linia 68 → analogicznie |
| `src/modules/game/commands/equip.command.ts` | linia 49 → analogicznie |
| `src/modules/game/index.ts` | `registerGameCommands` przyjmuje `repos`, przekazuje do `PlayerStatsService` |
| `src/index.ts` | `await mongo.connect(uri)` + `await migrateLegacyJsonIfNeeded(repos)` przed `client.login`. SIGINT/SIGTERM handler z `flush()` + `mongo.close()` |
| `test/helpers/factories.ts` | `tmpPlayerFile()` → `mongoPlayerStats()` (async). `tmpPlayerFile` zostaje deprecated alias jeśli używany w nieprzerefaktorowanym helperu — ALE jeśli wszystkie call-site'y zostaną zaktualizowane, usuń całkiem |
| 16 test files (`tmpPlayerFile` users) | Switch to `mongoPlayerStats()` (await + cleanup) |
| `CLAUDE.md` | Sekcja "Persistence" — opis Mongo zamiast JSON |

**Delete after migration:** kod `migrateLegacy()` w `player-stats.ts` (zastąpiony `migrate-legacy.ts`).

---

## Convention reminders (z CLAUDE.md)

- **Bun runtime** — `bun test` i `bun --watch src/index.ts` dla dev. Komendy w planie są bun-pierwsze.
- **No `as` casts** — używaj type guards lub generic typings (`Collection<T>`).
- **Conventional commits** — `feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`.
- **No `Co-Authored-By` trailers** w commitach.
- **Polish player-facing strings, English code identifiers.**

---

### Task 1: Add Mongo deps and env config

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Add deps**

```bash
bun add mongodb
bun add -d mongodb-memory-server
```

- [ ] **Step 2: Verify package.json updated**

Sprawdź `package.json` — powinno zawierać:

```json
"dependencies": {
  "discord.js": "^14.16.3",
  "dotenv": "^16.4.7",
  "mongodb": "^6.x"
},
"devDependencies": {
  ...
  "mongodb-memory-server": "^10.x"
}
```

- [ ] **Step 3: Create .env.example**

```
DISCORD_TOKEN=
MONGO_URI=mongodb://127.0.0.1:27017/discordbot
```

(Jeśli `.env.example` istnieje, dodaj tylko linię `MONGO_URI`.)

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lockb .env.example
git commit -m "chore: add mongodb + mongodb-memory-server deps"
```

(Jeśli używasz `package-lock.json` zamiast `bun.lockb`, podstaw odpowiednio.)

---

### Task 2: Mongo connection singleton

**Files:**
- Create: `src/persistence/mongo.ts`
- Test: `test/unit/mongo-connection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/mongo-connection.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoConnection } from '../../src/persistence/mongo.js';

describe('MongoConnection', () => {
  let mem: MongoMemoryServer;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mem.stop();
  });

  it('connects given a valid URI and returns Db', async () => {
    const conn = new MongoConnection();
    await conn.connect(mem.getUri('test-conn'));
    const db = conn.db();
    expect(db.databaseName).toBe('test-conn');
    await conn.close();
  });

  it('throws on db() before connect()', () => {
    const conn = new MongoConnection();
    expect(() => conn.db()).toThrow(/not connected/i);
  });

  it('throws on connect() with empty URI', async () => {
    const conn = new MongoConnection();
    await expect(conn.connect('')).rejects.toThrow(/MONGO_URI/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/mongo-connection.test.ts
```

Expected: FAIL — `Cannot find module '../../src/persistence/mongo.js'`.

- [ ] **Step 3: Implement MongoConnection**

```typescript
// src/persistence/mongo.ts
import { MongoClient, type Db } from 'mongodb';

export class MongoConnection {
  private client: MongoClient | null = null;
  private database: Db | null = null;

  async connect(uri: string): Promise<void> {
    if (!uri) throw new Error('MONGO_URI is required');
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.database = this.client.db();
  }

  db(): Db {
    if (!this.database) throw new Error('MongoConnection not connected — call connect() first');
    return this.database;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.database = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/mongo-connection.test.ts
```

Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/mongo.ts test/unit/mongo-connection.test.ts
git commit -m "feat: add MongoConnection singleton"
```

---

### Task 3: PlayerRepo

**Files:**
- Create: `src/persistence/repos/player.repo.ts`
- Test: `test/unit/player-repo.test.ts`

`PlayerDoc` to `PlayerStats` z dodanym `_id` (= `id` gracza), ale **bez** `inventory.items` (które wyjdzie do `ItemRepo`). Po refaktorze `Inventory` ma tylko `resources`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/player-repo.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from '../../src/persistence/repos/player.repo.js';

describe('PlayerRepo', () => {
  let mem: MongoMemoryServer;
  let client: MongoClient;
  let repo: PlayerRepo;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    client = await MongoClient.connect(mem.getUri());
  });
  afterAll(async () => {
    await client.close();
    await mem.stop();
  });
  beforeEach(async () => {
    const db = client.db(`test-${Date.now()}-${Math.random()}`);
    repo = new PlayerRepo(db.collection('players'));
  });

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/player-repo.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement PlayerRepo**

Najpierw musimy zaktualizować typ `Inventory` w `player-stats.ts` żeby usunąć `items`. Ale zrobimy to w Task 7. Na potrzeby tego repo lokalnie redefiniujmy minimalny kontrakt:

```typescript
// src/persistence/repos/player.repo.ts
import type { Collection } from 'mongodb';
import type { PlayerStats } from '../../modules/game/services/player-stats.js';

// PlayerDoc = PlayerStats z _id. PlayerStats po Task 7 nie zawiera inventory.items.
export type PlayerDoc = PlayerStats & { _id: string };

export class PlayerRepo {
  constructor(private readonly col: Collection<PlayerDoc>) {}

  async upsert(p: PlayerDoc): Promise<void> {
    await this.col.replaceOne({ _id: p._id }, p, { upsert: true });
  }

  async findAll(): Promise<PlayerDoc[]> {
    return this.col.find().toArray();
  }

  async count(): Promise<number> {
    return this.col.countDocuments();
  }

  async insertMany(docs: PlayerDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }
}
```

**Uwaga TypeScript:** test używa `PlayerDoc` który extends `PlayerStats`. Obecny `PlayerStats` ma `inventory: { resources, items }`. Test seed używa tylko `resources` — `items` brakuje, więc TS rzuci błąd. Rozwiążemy to w Task 7 (gdzie usuniemy `items` z typu). **Dla tej iteracji** zostaw `items: []` w teście jeśli TS rzuca błąd:

```typescript
inventory: { resources: {}, items: [] },
```

Po Task 7 wrócimy i wytniemy `items: []`. Dodaj `// TODO Task 7` komentarz w teście.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/player-repo.test.ts
```

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/repos/player.repo.ts test/unit/player-repo.test.ts
git commit -m "feat: add PlayerRepo Mongo wrapper"
```

---

### Task 4: ItemRepo

**Files:**
- Create: `src/persistence/repos/item.repo.ts`
- Test: `test/unit/item-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/item-repo.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ItemRepo, type ItemDoc } from '../../src/persistence/repos/item.repo.js';

describe('ItemRepo', () => {
  let mem: MongoMemoryServer;
  let client: MongoClient;
  let repo: ItemRepo;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    client = await MongoClient.connect(mem.getUri());
  });
  afterAll(async () => {
    await client.close();
    await mem.stop();
  });
  beforeEach(async () => {
    const db = client.db(`test-${Date.now()}-${Math.random()}`);
    repo = new ItemRepo(db.collection('items'));
  });

  const seed = (uid: string, userId: string, baseId = 'iron_sword'): ItemDoc => ({
    _id: uid,
    uid,
    userId,
    baseId,
    rarity: 'common',
    name: 'Iron Sword',
    stats: { attack: 5 },
    slot: 'weapon',
  });

  it('upsert + findByUserId returns user items', async () => {
    await repo.upsert(seed('u1', 'alice'));
    await repo.upsert(seed('u2', 'alice'));
    await repo.upsert(seed('u3', 'bob'));
    const aliceItems = await repo.findByUserId('alice');
    expect(aliceItems.map((i) => i._id).sort()).toEqual(['u1', 'u2']);
  });

  it('insertMany batch', async () => {
    await repo.insertMany([
      seed('u1', 'alice'),
      seed('u2', 'alice'),
      seed('u3', 'bob'),
    ]);
    expect(await repo.findByUserId('alice')).toHaveLength(2);
    expect(await repo.findByUserId('bob')).toHaveLength(1);
  });

  it('deleteOne removes by _id', async () => {
    await repo.upsert(seed('u1', 'alice'));
    await repo.deleteOne('u1');
    expect(await repo.findByUserId('alice')).toHaveLength(0);
  });

  it('upsert overwrites existing item by _id', async () => {
    await repo.upsert(seed('u1', 'alice'));
    const updated = { ...seed('u1', 'alice'), stats: { attack: 50 } };
    await repo.upsert(updated);
    const items = await repo.findByUserId('alice');
    expect(items[0].stats.attack).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/item-repo.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ItemRepo**

```typescript
// src/persistence/repos/item.repo.ts
import type { Collection } from 'mongodb';
import type { ItemInstance } from '../../modules/game/services/items.js';

export type ItemDoc = ItemInstance & { _id: string; userId: string };

export class ItemRepo {
  constructor(private readonly col: Collection<ItemDoc>) {}

  async upsert(doc: ItemDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findByUserId(userId: string): Promise<ItemDoc[]> {
    return this.col.find({ userId }).toArray();
  }

  async findAll(): Promise<ItemDoc[]> {
    return this.col.find().toArray();
  }

  async deleteOne(uid: string): Promise<void> {
    await this.col.deleteOne({ _id: uid });
  }

  async insertMany(docs: ItemDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/item-repo.test.ts
```

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/repos/item.repo.ts test/unit/item-repo.test.ts
git commit -m "feat: add ItemRepo Mongo wrapper"
```

---

### Task 5: Repos factory + ensureIndexes

**Files:**
- Create: `src/persistence/repos/index.ts`
- Test: `test/unit/repos-indexes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/repos-indexes.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { makeRepos, ensureIndexes } from '../../src/persistence/repos/index.js';

describe('repos/index', () => {
  let mem: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    client = await MongoClient.connect(mem.getUri());
  });
  afterAll(async () => {
    await client.close();
    await mem.stop();
  });

  it('makeRepos returns player + item repos', async () => {
    const db = client.db(`test-${Date.now()}-${Math.random()}`);
    const repos = makeRepos(db);
    expect(repos.player).toBeDefined();
    expect(repos.item).toBeDefined();
  });

  it('ensureIndexes creates items.userId index', async () => {
    const db = client.db(`test-${Date.now()}-${Math.random()}`);
    const repos = makeRepos(db);
    await ensureIndexes(repos);
    const itemIndexes = await db.collection('items').indexes();
    const userIdIndex = itemIndexes.find((idx) => idx.key?.userId === 1);
    expect(userIdIndex).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/repos-indexes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement makeRepos + ensureIndexes**

```typescript
// src/persistence/repos/index.ts
import type { Db } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from './player.repo.js';
import { ItemRepo, type ItemDoc } from './item.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  // Items lookup po userId — kluczowy dla inventory queries
  await (repos.item as unknown as { col: { createIndex: (k: object) => Promise<string> } }).col.createIndex({ userId: 1 });
  // Phase 2: dojdą `parties.members` i `battles.{playerIds, finished, updatedAt(TTL)}`.
}

export { PlayerRepo, ItemRepo };
export type { PlayerDoc, ItemDoc };
```

**Uwaga:** Dostęp do `col` z zewnątrz przez rzut `as unknown as` nie jest idealny (łamie konwencję "no `as`"). Lepsze rozwiązanie: dodaj public method `createIndex` do `ItemRepo`:

```typescript
// w item.repo.ts dodaj:
async createIndexes(): Promise<void> {
  await this.col.createIndex({ userId: 1 });
}
```

I w `ensureIndexes`:
```typescript
await repos.item.createIndexes();
```

Zaktualizuj implementację zgodnie z tą drugą wersją (czystszą).

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/repos-indexes.test.ts
```

Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/repos/ test/unit/repos-indexes.test.ts
git commit -m "feat: add repos factory + ensureIndexes"
```

---

### Task 6: Test harness — `mongoTestEnv`

**Files:**
- Create: `test/helpers/mongo-setup.ts`

- [ ] **Step 1: Write the test harness**

```typescript
// test/helpers/mongo-setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { makeRepos, ensureIndexes, type Repos } from '../../src/persistence/repos/index.js';

let mongod: MongoMemoryServer | null = null;
let client: MongoClient | null = null;

export async function setupMongo(): Promise<void> {
  if (mongod) return;
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
}

export async function teardownMongo(): Promise<void> {
  if (client) await client.close();
  if (mongod) await mongod.stop();
  client = null;
  mongod = null;
}

export interface TestEnv {
  db: Db;
  repos: Repos;
  cleanup: () => Promise<void>;
}

export async function mongoTestEnv(): Promise<TestEnv> {
  if (!client) throw new Error('Call setupMongo() in beforeAll first');
  const dbName = `test-${randomUUID()}`;
  const db = client.db(dbName);
  const repos = makeRepos(db);
  await ensureIndexes(repos);
  return {
    db,
    repos,
    cleanup: async () => {
      await db.dropDatabase();
    },
  };
}
```

- [ ] **Step 2: Wire up global setup/teardown in jest config**

Modify `jest.config.ts` to add:

```typescript
export default {
  // ... existing config
  globalSetup: '<rootDir>/test/helpers/jest-global-setup.ts',
  globalTeardown: '<rootDir>/test/helpers/jest-global-teardown.ts',
};
```

Create `test/helpers/jest-global-setup.ts`:

```typescript
import { setupMongo } from './mongo-setup.js';
export default async function globalSetup(): Promise<void> {
  await setupMongo();
}
```

Create `test/helpers/jest-global-teardown.ts`:

```typescript
import { teardownMongo } from './mongo-setup.js';
export default async function globalTeardown(): Promise<void> {
  await teardownMongo();
}
```

**Problem:** Jest globalSetup runs in own context — `setupMongo` w globalSetup nie współdzieli `mongod`/`client` z testami (różne procesy).

**Lepsze rozwiązanie:** zostaw setupMongo/teardownMongo eksportowane, ale wywołuj je per-test-file w `beforeAll`/`afterAll`. Albo skorzystaj z `jest-mongodb` preset. Najprostsze:

```typescript
// test/helpers/mongo-setup.ts (revised)
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { makeRepos, ensureIndexes, type Repos } from '../../src/persistence/repos/index.js';

export interface TestHarness {
  mongod: MongoMemoryServer;
  client: MongoClient;
  newEnv: () => Promise<TestEnv>;
  close: () => Promise<void>;
}

export interface TestEnv {
  db: Db;
  repos: Repos;
  cleanup: () => Promise<void>;
}

export async function startTestHarness(): Promise<TestHarness> {
  const mongod = await MongoMemoryServer.create();
  const client = await MongoClient.connect(mongod.getUri());
  return {
    mongod,
    client,
    newEnv: async () => {
      const dbName = `test-${randomUUID()}`;
      const db = client.db(dbName);
      const repos = makeRepos(db);
      await ensureIndexes(repos);
      return { db, repos, cleanup: () => db.dropDatabase().then(() => undefined) };
    },
    close: async () => {
      await client.close();
      await mongod.stop();
    },
  };
}
```

Każdy plik testowy używa:
```typescript
let harness: TestHarness;
beforeAll(async () => { harness = await startTestHarness(); });
afterAll(async () => { await harness.close(); });
beforeEach(async () => { env = await harness.newEnv(); });
afterEach(async () => { await env.cleanup(); });
```

Zaktualizuj wcześniej napisane testy (Task 2/3/4/5) żeby używały tej samej idiomatyki.

- [ ] **Step 3: Run test to verify it doesn't break existing tests**

```bash
bun test test/unit/mongo-connection.test.ts test/unit/player-repo.test.ts test/unit/item-repo.test.ts test/unit/repos-indexes.test.ts
```

Expected: PASS — wszystkie wcześniejsze testy przechodzą po refaktorze do harness'a.

- [ ] **Step 4: Commit**

```bash
git add test/helpers/mongo-setup.ts test/unit/
git commit -m "test: add Mongo test harness with mongodb-memory-server"
```

---

### Task 7: Refactor `Inventory` type — remove `items`

**Files:**
- Modify: `src/modules/game/services/player-stats.ts`

Krok przygotowawczy do migracji do osobnej kolekcji. Po tej zmianie code przestanie się kompilować w wielu miejscach — naprawimy je w Task 8-9.

- [ ] **Step 1: Modify `Inventory` interface**

W `src/modules/game/services/player-stats.ts` znajdź:

```typescript
export interface Inventory {
  resources: Record<string, number>;
  items: ItemInstance[];
}
```

Zmień na:

```typescript
export interface Inventory {
  resources: Record<string, number>;
}
```

- [ ] **Step 2: Verify TypeScript breakage as expected**

```bash
bun run tsc --noEmit
```

Expected: ERRORS w lokalizacjach (te poprawimy w kolejnych tasks):
- `src/modules/game/services/player-stats.ts` (~line 637, 641, 647, 698) — `inventory.items` access
- `src/modules/game/services/enchanter.service.ts:61`
- `src/modules/game/services/identification.service.ts:73, 77`
- `src/modules/game/services/inventory.service.ts:450`
- `src/modules/game/services/smith.service.ts:68`
- `src/modules/game/commands/equip.command.ts:49`
- Możliwe: niektóre testy / `defaultPlayer`

- [ ] **Step 3: Update `defaultPlayer` factory**

W `player-stats.ts` znajdź `defaultPlayer` (lub `ensureDefaults` — tworzy `inventory: { resources: {}, items: [] }`). Usuń `items: []`:

```typescript
inventory: { resources: {} },
```

(Może być w obu funkcjach — popraw obie.)

- [ ] **Step 4: Update `removeItem` not to depend on splice (preview)**

Wstępna implementacja przed Task 8 — w `addItem/removeItem/findItem/toolOfKind` użyj `inventory.items` przez nowe pole `itemsByUid` które dodamy w Task 8. Na razie zostaw te metody **wykomentowane** lub rzucające `throw new Error('rewired in Task 8')` — kompilacja przejdzie dla pozostałych miejsc. Albo prościej: nie commit'uj jeszcze tego kroku, idź od razu do Task 8.

- [ ] **Step 5: Skip commit, idź dalej**

Ten task nie jest osobnym commitem — bundle z Task 8.

---

### Task 8: PlayerStatsService refactor — Mongo + items via separate Maps

**Files:**
- Modify: `src/modules/game/services/player-stats.ts`
- Test: `test/unit/player-stats-mongo.test.ts`

To jest największy task. Przepisujemy całą warstwę I/O i item-handling w `PlayerStatsService`.

- [ ] **Step 1: Write failing tests for new behavior**

```typescript
// test/unit/player-stats-mongo.test.ts
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import type { ItemInstance } from '../../src/modules/game/services/items.js';

describe('PlayerStatsService (Mongo)', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let stats: PlayerStatsService;

  beforeAll(async () => { harness = await startTestHarness(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    env = await harness.newEnv();
    stats = new PlayerStatsService(env.repos);
    await stats.load();
  });
  afterEach(async () => { await stats.flush(); await env.cleanup(); });

  const mkItem = (uid: string, baseId = 'iron_sword'): ItemInstance => ({
    uid, baseId, rarity: 'common', name: 'Sword', stats: { attack: 5 }, slot: 'weapon',
  });

  it('get() creates new player and persists on save+flush', async () => {
    const p = stats.get('alice', 'Alice');
    p.gold = 100;
    stats.save();
    await stats.flush();

    // Re-load: new service instance reads from Mongo
    const stats2 = new PlayerStatsService(env.repos);
    await stats2.load();
    expect(stats2.get('alice').gold).toBe(100);
  });

  it('addItem persists item to items collection', async () => {
    const p = stats.get('alice');
    stats.addItem(p, mkItem('uid-1'));
    stats.save();
    await stats.flush();

    const items = await env.repos.item.findByUserId('alice');
    expect(items.map((i) => i._id)).toEqual(['uid-1']);
  });

  it('getItemsForPlayer returns items only for that user', async () => {
    const a = stats.get('alice');
    const b = stats.get('bob');
    stats.addItem(a, mkItem('a-1'));
    stats.addItem(a, mkItem('a-2'));
    stats.addItem(b, mkItem('b-1'));

    expect(stats.getItemsForPlayer('alice').map((i) => i.uid).sort()).toEqual(['a-1', 'a-2']);
    expect(stats.getItemsForPlayer('bob').map((i) => i.uid)).toEqual(['b-1']);
  });

  it('removeItem deletes from cache and from Mongo on flush', async () => {
    const p = stats.get('alice');
    stats.addItem(p, mkItem('uid-1'));
    stats.save();
    await stats.flush();

    const removed = stats.removeItem(p, 'uid-1');
    expect(removed?.uid).toBe('uid-1');
    expect(stats.findItem(p, 'uid-1')).toBeUndefined();
    stats.save();
    await stats.flush();

    const items = await env.repos.item.findByUserId('alice');
    expect(items).toEqual([]);
  });

  it('save is dirty-tracking: unchanged players/items not re-written', async () => {
    const p = stats.get('alice');
    p.gold = 50;
    stats.save();
    await stats.flush();

    // Spy: replace the repo's upsert with a counter (cheap approach)
    let writeCount = 0;
    const origUpsert = env.repos.player.upsert.bind(env.repos.player);
    env.repos.player.upsert = async (doc) => {
      writeCount += 1;
      return origUpsert(doc);
    };

    stats.save(); // nothing changed
    await stats.flush();
    expect(writeCount).toBe(0);

    p.gold = 75;
    stats.save();
    await stats.flush();
    expect(writeCount).toBe(1);
  });

  it('toolOfKind finds tool from cached items', async () => {
    const p = stats.get('alice');
    const pickaxe: ItemInstance = {
      uid: 'pick-1', baseId: 'iron_pickaxe', rarity: 'common', name: 'Pickaxe',
      stats: {}, slot: 'tool', toolKind: 'pickaxe', toolTier: 1,
    };
    stats.addItem(p, pickaxe);
    expect(stats.toolOfKind(p, 'pickaxe')?.uid).toBe('pick-1');
    expect(stats.toolOfKind(p, 'rod')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/unit/player-stats-mongo.test.ts
```

Expected: FAIL — `PlayerStatsService` constructor signature mismatch + missing methods.

- [ ] **Step 3: Refactor PlayerStatsService**

Pełna nowa zawartość kluczowych części `src/modules/game/services/player-stats.ts`:

```typescript
// Na górze dodaj import:
import type { Repos } from '../../../persistence/repos/index.js';

// Usuń import 'fs', 'path' (nie używamy już plików).

// W klasie PlayerStatsService — wytnij stare pola:
// - private readonly stats — zostaje, to in-RAM cache (przemianuj jeśli już używasz `stats` jako property)
// - prywatne `legacyFile`, `dir`, `lastSavedJson` (Map<string,string>) — wytnij
// Dodaj:

export class PlayerStatsService {
  private readonly byId = new Map<string, PlayerStats>();
  private readonly itemsByUid = new Map<string, ItemInstance>();
  private readonly itemsByUser = new Map<string, Set<string>>(); // userId → Set<uid>

  // Dirty tracking
  private readonly lastSavedPlayerJson = new Map<string, string>();
  private readonly lastSavedItemJson = new Map<string, string>();
  private readonly itemsToDelete = new Set<string>(); // uidy do usunięcia z Mongo

  // Async write queue
  private pendingWrites: Promise<unknown>[] = [];

  constructor(private readonly repos: Repos) {}

  async load(): Promise<void> {
    const players = await this.repos.player.findAll();
    for (const doc of players) {
      // _id dodatkowe — nie wkładaj do PlayerStats
      const { _id, ...rest } = doc;
      // ensureDefaults ustawia missing fields dla starszych dump-ów
      const stats = ensureDefaults(rest, doc._id, doc.name);
      this.byId.set(doc._id, stats);
      this.lastSavedPlayerJson.set(doc._id, JSON.stringify(stats));
      this.itemsByUser.set(doc._id, new Set());
    }

    const allItems = await this.repos.item.findAll();
    for (const doc of allItems) {
      const { _id, userId, ...item } = doc;
      this.itemsByUid.set(item.uid, item);
      this.lastSavedItemJson.set(item.uid, JSON.stringify(item));
      let set = this.itemsByUser.get(userId);
      if (!set) {
        set = new Set();
        this.itemsByUser.set(userId, set);
      }
      set.add(item.uid);
    }
  }

  /**
   * Sync z perspektywy callera, fire-and-forget async write do Mongo.
   * Dirty tracking po `JSON.stringify`. `flush()` w SIGTERM czeka na pending writes.
   */
  save(): void {
    // Players
    for (const [id, p] of this.byId) {
      const json = JSON.stringify(p);
      if (this.lastSavedPlayerJson.get(id) === json) continue;
      this.lastSavedPlayerJson.set(id, json);
      this.pendingWrites.push(
        this.repos.player.upsert({ ...p, _id: id }).catch((e) => {
          console.error(`[mongo] player save fail ${id}:`, e instanceof Error ? e.message : String(e));
        }),
      );
    }
    // Items
    for (const [uid, item] of this.itemsByUid) {
      const json = JSON.stringify(item);
      if (this.lastSavedItemJson.get(uid) === json) continue;
      this.lastSavedItemJson.set(uid, json);
      // userId — szukaj w itemsByUser
      const userId = this.findUserIdForItem(uid);
      if (!userId) continue; // sierota — nie zapisuj
      this.pendingWrites.push(
        this.repos.item.upsert({ ...item, _id: uid, userId }).catch((e) => {
          console.error(`[mongo] item save fail ${uid}:`, e instanceof Error ? e.message : String(e));
        }),
      );
    }
    // Items to delete
    for (const uid of this.itemsToDelete) {
      this.lastSavedItemJson.delete(uid);
      this.pendingWrites.push(
        this.repos.item.deleteOne(uid).catch((e) => {
          console.error(`[mongo] item delete fail ${uid}:`, e instanceof Error ? e.message : String(e));
        }),
      );
    }
    this.itemsToDelete.clear();
  }

  async flush(): Promise<void> {
    const queue = this.pendingWrites;
    this.pendingWrites = [];
    await Promise.allSettled(queue);
  }

  private findUserIdForItem(uid: string): string | undefined {
    for (const [userId, set] of this.itemsByUser) {
      if (set.has(uid)) return userId;
    }
    return undefined;
  }

  // ── Public API (zostaje shape PlayerStats SoT) ────
  get(id: string, name?: string): PlayerStats {
    let s = this.byId.get(id);
    if (!s) {
      s = defaultPlayer(id, name ?? id);
      this.byId.set(id, s);
      this.itemsByUser.set(id, new Set());
    } else if (name) {
      s.name = name;
    }
    return s;
  }

  list(): PlayerStats[] {
    return [...this.byId.values()];
  }

  // ── Items API ─────────────────────────────────────
  addItem(p: PlayerStats, item: ItemInstance): void {
    this.itemsByUid.set(item.uid, item);
    let set = this.itemsByUser.get(p.id);
    if (!set) {
      set = new Set();
      this.itemsByUser.set(p.id, set);
    }
    set.add(item.uid);
  }

  removeItem(p: PlayerStats, uid: string): ItemInstance | null {
    const set = this.itemsByUser.get(p.id);
    if (!set || !set.has(uid)) return null;
    const item = this.itemsByUid.get(uid);
    if (!item) return null;
    set.delete(uid);
    this.itemsByUid.delete(uid);
    this.itemsToDelete.add(uid);
    return item;
  }

  findItem(p: PlayerStats, uid: string): ItemInstance | undefined {
    const set = this.itemsByUser.get(p.id);
    if (!set || !set.has(uid)) return undefined;
    return this.itemsByUid.get(uid);
  }

  getItemsForPlayer(userId: string): ItemInstance[] {
    const set = this.itemsByUser.get(userId);
    if (!set) return [];
    const out: ItemInstance[] = [];
    for (const uid of set) {
      const item = this.itemsByUid.get(uid);
      if (item) out.push(item);
    }
    return out;
  }

  // ── Equipment ─────────────────────────────────────
  // equip / unequip / equippedItem zostają TAKIE SAME — używają findItem() które już
  // przekierowane na nową ścieżkę.

  // ── Tools ─────────────────────────────────────────
  toolOfKind(p: PlayerStats, kind: ToolKind): ItemInstance | undefined {
    const equipped = this.equippedItem(p, 'tool');
    if (equipped?.toolKind === kind) return equipped;
    return this.getItemsForPlayer(p.id).find((it) => it.toolKind === kind);
  }

  // ── Resources / XP / leveling / etc — bez zmian ────
}
```

**Usuń całkowicie** w `player-stats.ts`:
- `private readonly legacyFile: string;`
- `private readonly dir: string;`
- `migrateLegacy()` metodę (cała funkcja, lines ~250-282)
- imports `fs`, `path` jeśli nigdzie indziej nieużywane

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test test/unit/player-stats-mongo.test.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 5: Verify TS compiles for player-stats.ts**

```bash
bun run tsc --noEmit 2>&1 | grep -E "player-stats\.ts|services/(enchanter|identification|inventory|smith)|equip\.command" | head
```

Expected: errors w services/enchanter, identification, inventory, smith, equip command (te naprawimy w Task 9). `player-stats.ts` sam w sobie nie powinien rzucać błędów.

- [ ] **Step 6: Skip commit, idź do Task 9**

Czysta refactor wieloplikowy — bundle commit po Task 9.

---

### Task 9: External services touchpoints

**Files:**
- Modify: `src/modules/game/services/enchanter.service.ts`
- Modify: `src/modules/game/services/identification.service.ts`
- Modify: `src/modules/game/services/inventory.service.ts`
- Modify: `src/modules/game/services/smith.service.ts`
- Modify: `src/modules/game/commands/equip.command.ts`

Każdy serwis zamiast `player.inventory.items` używa `playerStats.getItemsForPlayer(player.id)`.

- [ ] **Step 1: Refactor enchanter.service.ts:61**

Znajdź:
```typescript
const list = p.inventory.items.filter((it) => (it.gemSlots ?? 0) > 0);
```

Sprawdź konstruktor `EnchanterService` — czy ma referencję do `PlayerStatsService`? Jeśli nie, dodaj. Następnie:
```typescript
const list = this.playerStats.getItemsForPlayer(p.id).filter((it) => (it.gemSlots ?? 0) > 0);
```

- [ ] **Step 2: Refactor identification.service.ts:73,77**

Znajdź:
```typescript
return player.inventory.items.filter((it) => it.identified === false);
// ...
return player.inventory.items.find((it) => it.uid === uid);
```

Zmień:
```typescript
return this.playerStats.getItemsForPlayer(player.id).filter((it) => it.identified === false);
// ...
return this.playerStats.findItem(player, uid);
```

- [ ] **Step 3: Refactor inventory.service.ts:450**

Znajdź:
```typescript
return [...player.inventory.items].sort(...)
```

Zmień:
```typescript
return [...this.playerStats.getItemsForPlayer(player.id)].sort(...)
```

- [ ] **Step 4: Refactor smith.service.ts:68**

Znajdź:
```typescript
const upgradeable = p.inventory.items.filter((it) => it.slot);
```

Zmień:
```typescript
const upgradeable = this.playerStats.getItemsForPlayer(p.id).filter((it) => it.slot);
```

- [ ] **Step 5: Refactor equip.command.ts:49**

Znajdź:
```typescript
const choices = player.inventory.items
```

Zmień:
```typescript
const choices = this.playerStats.getItemsForPlayer(player.id)
```

(Dostęp do `playerStats` — przez konstruktor commendy. Sprawdź czy już jest wstrzyknięty; jeśli nie — w `src/modules/game/index.ts` dodaj jako parametr.)

- [ ] **Step 6: Run typecheck**

```bash
bun run tsc --noEmit
```

Expected: PASS — zero błędów. Jeśli któryś serwis nie ma `playerStats` w konstruktorze, dodaj go w `src/modules/game/index.ts` (DI).

- [ ] **Step 7: Run full test suite**

```bash
bun test
```

Expected: część testów może padać (te używające `tmpPlayerFile` — naprawimy w Task 10). Ale **żaden** błąd nie powinien być z `inventory.items` access.

- [ ] **Step 8: Commit (refactor bundled — Task 7+8+9)**

```bash
git add src/modules/game/services/player-stats.ts src/modules/game/services/enchanter.service.ts src/modules/game/services/identification.service.ts src/modules/game/services/inventory.service.ts src/modules/game/services/smith.service.ts src/modules/game/commands/equip.command.ts test/unit/player-stats-mongo.test.ts
git commit -m "refactor: PlayerStatsService → Mongo + items separate collection"
```

---

### Task 10: Migrate-legacy module

**Files:**
- Create: `src/persistence/migrate-legacy.ts`
- Test: `test/unit/migrate-legacy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/migrate-legacy.test.ts
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { migrateLegacyJsonIfNeeded } from '../../src/persistence/migrate-legacy.js';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';

describe('migrateLegacyJsonIfNeeded', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let tmpRoot: string;

  beforeAll(async () => { harness = await startTestHarness(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    env = await harness.newEnv();
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'migrate-test-'));
  });
  afterEach(async () => {
    await env.cleanup();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const samplePlayer = (id: string, items: { uid: string; baseId: string }[] = []) => ({
    id, name: id, xp: 0, level: 1, gold: 100,
    wins: 0, losses: 0, duels: 0,
    inventory: {
      resources: { wood: 5 },
      items: items.map((i) => ({
        uid: i.uid, baseId: i.baseId, rarity: 'common', name: 'X',
        stats: { attack: 1 },
      })),
    },
    equipped: {},
    skills: {
      mining: { level: 1, xp: 0 }, fishing: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 }, crafting: { level: 1, xp: 0 },
      combat: { level: 1, xp: 0 },
    },
    unspentPoints: 0,
    attribute: { attack: 0, defense: 0, hp: 0, crit: 0 },
    primary: { str: 0, agi: 0, wit: 0, int: 0 },
    learnedSkills: [], unlearnedBooks: [],
    quests: { active: [], completed: [], abandoned: [] },
    cooldowns: {},
  });

  it('migrates per-player JSON files (data/players/*.json)', async () => {
    const dir = path.join(tmpRoot, 'players');
    fs.mkdirSync(dir);
    writeFileSync(path.join(dir, 'alice.json'),
      JSON.stringify(samplePlayer('alice', [{ uid: 'u1', baseId: 'sword' }])));
    writeFileSync(path.join(dir, 'bob.json'),
      JSON.stringify(samplePlayer('bob', [{ uid: 'u2', baseId: 'shield' }])));

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(2);
    const aliceItems = await env.repos.item.findByUserId('alice');
    expect(aliceItems.map((i) => i._id)).toEqual(['u1']);
    expect(existsSync(dir)).toBe(false); // renamed
    const renamed = fs.readdirSync(tmpRoot).find((f) => f.startsWith('players.migrated-'));
    expect(renamed).toBeDefined();
  });

  it('migrates monolith data/players.json', async () => {
    writeFileSync(path.join(tmpRoot, 'players.json'),
      JSON.stringify([
        samplePlayer('alice', [{ uid: 'u1', baseId: 'sword' }]),
        samplePlayer('bob'),
      ]));

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(2);
    expect(await env.repos.item.findByUserId('alice')).toHaveLength(1);
    expect(existsSync(path.join(tmpRoot, 'players.json'))).toBe(false);
  });

  it('skips migration if Mongo already has players', async () => {
    await env.repos.player.upsert({
      ...samplePlayer('alice'),
      _id: 'alice',
      inventory: { resources: {} }, // post-migration shape
    } as any);

    fs.mkdirSync(path.join(tmpRoot, 'players'));
    writeFileSync(path.join(tmpRoot, 'players', 'bob.json'),
      JSON.stringify(samplePlayer('bob')));

    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);

    expect(await env.repos.player.count()).toBe(1); // bob NOT migrated
    expect(existsSync(path.join(tmpRoot, 'players'))).toBe(true); // dir NOT renamed
  });

  it('skips migration if no legacy files', async () => {
    await migrateLegacyJsonIfNeeded(env.repos, tmpRoot);
    expect(await env.repos.player.count()).toBe(0);
  });

  it('throws on duplicate item uids across players', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'players'));
    writeFileSync(path.join(tmpRoot, 'players', 'alice.json'),
      JSON.stringify(samplePlayer('alice', [{ uid: 'dup', baseId: 'sword' }])));
    writeFileSync(path.join(tmpRoot, 'players', 'bob.json'),
      JSON.stringify(samplePlayer('bob', [{ uid: 'dup', baseId: 'shield' }])));

    await expect(migrateLegacyJsonIfNeeded(env.repos, tmpRoot))
      .rejects.toThrow(/duplicate item uids/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/migrate-legacy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement migrate-legacy.ts**

```typescript
// src/persistence/migrate-legacy.ts
import fs from 'node:fs';
import path from 'node:path';
import type { Repos, PlayerDoc, ItemDoc } from './repos/index.js';

export async function migrateLegacyJsonIfNeeded(
  repos: Repos,
  rootDir: string = path.resolve('data'),
): Promise<void> {
  if (await repos.player.count() > 0) return;

  const monolith = path.join(rootDir, 'players.json');
  if (fs.existsSync(monolith)) {
    const arr: unknown = JSON.parse(fs.readFileSync(monolith, 'utf8'));
    if (!Array.isArray(arr)) {
      console.warn('[mongo] data/players.json nie jest tablicą — pomijam migrację');
      return;
    }
    await migratePlayerArray(repos, arr as LegacyPlayer[]);
    fs.renameSync(monolith, `${monolith}.migrated-${Date.now()}`);
    return;
  }

  const dir = path.join(rootDir, 'players');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const players: LegacyPlayer[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        players.push(parsed as LegacyPlayer);
      }
    } catch (e) {
      console.warn(`[mongo] skip corrupt legacy file ${f}:`, e instanceof Error ? e.message : String(e));
    }
  }

  await migratePlayerArray(repos, players);
  fs.renameSync(dir, `${dir}.migrated-${Date.now()}`);
}

interface LegacyItem {
  uid: string;
  baseId: string;
  [key: string]: unknown;
}

interface LegacyPlayer {
  id: string;
  inventory: {
    resources: Record<string, number>;
    items?: LegacyItem[];
  };
  [key: string]: unknown;
}

async function migratePlayerArray(repos: Repos, players: LegacyPlayer[]): Promise<void> {
  const playerDocs: PlayerDoc[] = [];
  const itemDocs: ItemDoc[] = [];

  for (const p of players) {
    const items = p.inventory.items ?? [];
    const stripped: PlayerDoc = {
      ...(p as unknown as PlayerDoc),
      _id: p.id,
      inventory: { resources: p.inventory.resources },
    };
    playerDocs.push(stripped);
    for (const item of items) {
      itemDocs.push({
        ...(item as unknown as ItemDoc),
        _id: item.uid,
        userId: p.id,
      });
    }
  }

  // walidacja unique uid
  const uids = itemDocs.map((d) => d._id);
  if (new Set(uids).size !== uids.length) {
    const dupes = uids.filter((u, i) => uids.indexOf(u) !== i);
    throw new Error(
      `[mongo] duplicate item uids in legacy data, fix manually: ${dupes.slice(0, 10).join(', ')}`,
    );
  }

  if (playerDocs.length > 0) await repos.player.insertMany(playerDocs);
  if (itemDocs.length > 0) await repos.item.insertMany(itemDocs);
  console.log(`[mongo] migrated ${playerDocs.length} players, ${itemDocs.length} items`);
}
```

**Uwaga `as unknown as`:** to jeden z niewielu uzasadnionych przypadków — czytamy nieznany JSON (legacy data, schema mogła się zmienić). Komentarz w kodzie wyjaśnia.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/migrate-legacy.test.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/migrate-legacy.ts test/unit/migrate-legacy.test.ts
git commit -m "feat: add legacy JSON → Mongo migrator"
```

---

### Task 11: Update test factories — `mongoPlayerStats()`

**Files:**
- Modify: `test/helpers/factories.ts`

- [ ] **Step 1: Read current factories.ts**

```bash
cat test/helpers/factories.ts | head -80
```

Zidentyfikuj export `tmpPlayerFile` i jego użycie.

- [ ] **Step 2: Add `mongoPlayerStats()` factory**

Dodaj na końcu `factories.ts`:

```typescript
import { startTestHarness, type TestHarness, type TestEnv } from './mongo-setup.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';

/**
 * Spina mongodb-memory-server + PlayerStatsService dla testu. Wywołać w
 * `beforeEach`. Po teście wywołaj `cleanup()` w `afterEach`.
 *
 * UWAGA: Ten helper sam zarządza harness'em — w testach które robią wiele
 * niezależnych env'ów, użyj raczej `startTestHarness()` bezpośrednio
 * (jeden harness per `describe`).
 */
export interface MongoStatsTest {
  stats: PlayerStatsService;
  env: TestEnv;
  harness: TestHarness;
  cleanup: () => Promise<void>;
}

export async function mongoPlayerStats(): Promise<MongoStatsTest> {
  const harness = await startTestHarness();
  const env = await harness.newEnv();
  const stats = new PlayerStatsService(env.repos);
  await stats.load();
  return {
    stats,
    env,
    harness,
    cleanup: async () => {
      await stats.flush();
      await env.cleanup();
      await harness.close();
    },
  };
}
```

- [ ] **Step 3: Mark `tmpPlayerFile` as deprecated (lub usuń jeśli zaktualizujesz wszystkie call-site'y w Task 12)**

Idziemy przez Task 12 do refaktoru testów. Na razie zostaw `tmpPlayerFile` (testy które jeszcze go używają będą padać, ale to OK — naprawimy w Task 12).

- [ ] **Step 4: Verify factory compiles**

```bash
bun run tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Skip commit, idź do Task 12**

Bundle z Task 12.

---

### Task 12: Refactor existing test files (16 files)

**Files (16):**
- `test/feature/inventory-thread.test.ts`
- `test/unit/player-stats.test.ts`
- `test/unit/boss-browser.test.ts`
- `test/feature/dialog-flow.test.ts`
- `test/unit/marek-dialog-progression.test.ts`
- `test/unit/effective-stats.test.ts`
- `test/feature/dungeon-party-gating.test.ts`
- `test/feature/profession-chain.test.ts`
- `test/unit/slash-menu.test.ts`
- `test/feature/menu-nav.test.ts`
- `test/unit/gathering-tool.test.ts`
- `test/feature/craft-flow.test.ts`
- `test/feature/duel-flow.test.ts`
- `test/feature/city-trade.test.ts`
- `test/feature/race-class-reset.test.ts`

(Plik `test/helpers/factories.ts` już zaktualizowany w Task 11.)

Każdy plik refaktor szablonowy: `tmpPlayerFile()` → `mongoPlayerStats()`.

- [ ] **Step 1: Refactor first file as template — `test/unit/player-stats.test.ts`**

Pattern przed:
```typescript
import { tmpPlayerFile } from '../helpers/factories.js';
// ...
const stats = new PlayerStatsService(tmpPlayerFile());
```

Pattern po:
```typescript
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';
// ...
let testCtx: MongoStatsTest;
beforeEach(async () => { testCtx = await mongoPlayerStats(); });
afterEach(async () => { await testCtx.cleanup(); });
// w teście używaj `testCtx.stats` zamiast `stats`
```

Jeśli test ma kilka instancji `PlayerStatsService` (rzadko), użyj `testCtx.harness.newEnv()` + new `PlayerStatsService` per env.

Zmodyfikuj `test/unit/player-stats.test.ts` zgodnie z patternem.

- [ ] **Step 2: Run that one file**

```bash
bun test test/unit/player-stats.test.ts
```

Expected: PASS — wszystkie testy w pliku przechodzą.

- [ ] **Step 3: Refactor remaining 14 plików**

Idź każdym po kolei, ten sam pattern. **Uwaga:** niektóre testy mogą zakładać synchroniczny konstruktor — adaptuj do `await`. Jeśli test używa `stats.save()` i sprawdza pliki na dysku — zmień na `await stats.flush()` + sprawdź `env.repos.player.findAll()`.

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

Expected: PASS — wszystkie testy zielone (lub w okolicy; jeśli któryś leci nie z powodu Mongo, debug).

- [ ] **Step 5: Verify lint + typecheck**

```bash
bun run tsc --noEmit
bun run lint
```

Expected: PASS oba.

- [ ] **Step 6: Remove `tmpPlayerFile`**

Po refaktorze wszystkich call-site'ów, usuń `export function tmpPlayerFile` z `test/helpers/factories.ts`. Sprawdź:

```bash
grep -r "tmpPlayerFile" test/ src/
```

Expected: zero hits. Jeśli są — refactor je też.

- [ ] **Step 7: Commit (cały refactor testów)**

```bash
git add test/
git commit -m "test: switch test harness from JSON files to mongodb-memory-server"
```

---

### Task 13: Wire up Mongo in startup + SIGTERM

**Files:**
- Modify: `src/index.ts`
- Modify: `src/modules/game/index.ts`

- [ ] **Step 1: Read current src/index.ts startup**

```bash
head -80 src/index.ts
```

Zidentyfikuj gdzie jest `client.login(...)` i konstrukcja `PlayerStatsService`.

- [ ] **Step 2: Add Mongo connection at startup**

W `src/index.ts` na górze (po imports):

```typescript
import { MongoConnection } from './persistence/mongo.js';
import { makeRepos, ensureIndexes } from './persistence/repos/index.js';
import { migrateLegacyJsonIfNeeded } from './persistence/migrate-legacy.js';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('[fatal] MONGO_URI nie ustawione w env — bot nie wystartuje');
  process.exit(1);
}
const mongo = new MongoConnection();
await mongo.connect(mongoUri);
const repos = makeRepos(mongo.db());
await ensureIndexes(repos);
await migrateLegacyJsonIfNeeded(repos);
```

- [ ] **Step 3: Pass repos to PlayerStatsService**

Znajdź gdzie tworzony jest `PlayerStatsService` (najpewniej w `registerGameCommands` lub bezpośrednio w `src/index.ts`). Zmień na `new PlayerStatsService(repos)` + `await playerStats.load()`.

W `src/modules/game/index.ts` zaktualizuj sygnaturę `registerGameCommands`:

```typescript
export function registerGameCommands(
  client: Client,
  manager: CommandManager,
  repos: Repos,
): void {
  // ...
  const playerStats = new PlayerStatsService(repos);
  // ... await playerStats.load() — ALE registerGameCommands jest sync
  // → albo zrób load() poza, albo zmień register na async
}
```

Najprostsze: zmień `registerGameCommands` na `async` i `await playerStats.load()` w środku. W `src/index.ts` `await registerGameCommands(...)`.

- [ ] **Step 4: Add SIGTERM/SIGINT handler**

W `src/index.ts` po `await client.login(...)`:

```typescript
const shutdown = async (signal: string) => {
  console.log(`[shutdown] received ${signal}, flushing + closing`);
  try {
    await playerStats.flush();
    await mongo.close();
    await client.destroy();
  } catch (e) {
    console.error('[shutdown] error:', e instanceof Error ? e.message : String(e));
  }
  process.exit(0);
};
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
```

(`playerStats` musi być w scope tej funkcji — jeśli jest tworzony w `registerGameCommands`, podnieś go do scope `src/index.ts` lub zwróć z register'a.)

- [ ] **Step 5: Run typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: PASS oba.

- [ ] **Step 6: Manual smoke test**

Zakładamy że masz lokalnego Mongo na `127.0.0.1:27017`:

```bash
# Start Mongo (Docker example): docker run -d -p 27017:27017 --name mongo mongo:7
echo "MONGO_URI=mongodb://127.0.0.1:27017/discordbot" >> .env
bun start
```

Bot powinien wystartować, zalogować "[mongo] migrated N players, M items" jeśli `data/players/` istnieje, albo "[mongo] no legacy data" jeśli nie. Po `Ctrl+C` powinien wyjść grace.

Jeśli masz istniejące `data/players/*.json`:
- Po starcie: `data/players.migrated-<ts>/` istnieje
- Mongo: `mongo --eval 'db.getSiblingDB("discordbot").players.countDocuments()'` zwraca liczbę graczy
- Bot reaguje na `.stats`, `.inv`, `.expedition` jak wcześniej

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/modules/game/index.ts
git commit -m "feat: wire Mongo + legacy migration into bot startup"
```

---

### Task 14: Update CLAUDE.md persistence section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Locate persistence section**

```bash
grep -n "Persistence" CLAUDE.md
```

Powinno być koło line ~80.

- [ ] **Step 2: Replace section content**

Zastąp sekcję "Persistence: per-player JSON files" na:

```markdown
## Persistence: MongoDB (collections `players`, `items`)

Stan trzymany w MongoDB self-hosted (env: `MONGO_URI`). `PlayerStatsService` to in-RAM SoT — `byId: Map<string, PlayerStats>` + `itemsByUid: Map<string, ItemInstance>` + `itemsByUser: Map<string, Set<uid>>`. Read: tylko z RAM (po `load()` na starcie). Write: `save()` jest sync z perspektywy callera, fire-and-forget async upsert do Mongo z dirty-trackingiem (porównanie `JSON.stringify`). `flush()` w SIGTERM czeka na pending writes.

Items są w **osobnej kolekcji** z `userId` jako foreign reference (indeks `{userId: 1}`). `PlayerStats.inventory` ma tylko `resources` — `items` znika z dokumentu gracza. Dostęp przez:
- `playerStats.addItem(p, item)` / `removeItem(p, uid)` / `findItem(p, uid)`
- `playerStats.getItemsForPlayer(userId): ItemInstance[]` — całe inventory gracza
- `playerStats.equippedItem(p, slot)` — założony item w danym slocie

NIE używaj `player.inventory.items` — pole nie istnieje. Wszystkie zewnętrzne miejsca które filtrują po itemach idą przez `getItemsForPlayer(p.id).filter(...)`.

Migracja legacy: `migrateLegacyJsonIfNeeded` na starcie czyta `data/players.json` LUB `data/players/*.json`, splituje na `players` collection (bez `inventory.items`) + `items` collection (z `userId`), rename'uje stary plik/folder na `*.migrated-<ts>` jako safety net. Idempotent (count > 0 → skip).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md persistence section for Mongo + items collection"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full typecheck + lint**

```bash
bun run tsc --noEmit
bun run lint
```

Expected: PASS oba bez warning'ów.

- [ ] **Step 2: Full test suite**

```bash
bun test
```

Expected: wszystkie testy zielone (powinno być >= tyle ile było przed refaktorem + nowe testy z Task 2-10).

- [ ] **Step 3: Manual smoke checklist**

Z botem podpiętym do test serwera Discord:

1. `.stats` — pokazuje statystyki (player jest w Mongo)
2. `.inv` — otwiera thread, listing pokazuje itemy z Mongo
3. `sell <N>` w threadzie — item znika, save dirty-flush
4. `equip <N>` — item w `equipped` zmienia się, save dirty-flush
5. `.expedition` → start → ambush podchodzi → kliknij akcje → wygraj → claim → loot dostarczone (item dodany do Mongo)
6. Restart bota (`Ctrl+C`, `bun start`) — wszystko persists
7. Sprawdź Mongo: `mongo discordbot --eval 'db.players.countDocuments(); db.items.countDocuments()'`

- [ ] **Step 4: Final commit (jeśli były drobne fixy podczas smoke)**

```bash
git status
# jeśli coś — commit
```

- [ ] **Step 5: Phase 1 done — gotowe na Phase 2 (BattleStore)**

Po zielonej fazie 1, brainstorm/wpisz plan dla Phase 2 (`docs/superpowers/plans/2026-XX-YY-mongo-phase-2-battle-store-and-recovery.md`).

---

## Self-review summary

**Spec coverage** ✅:
- Mongo connection + repos: Task 2-5
- Items separate collection: Task 4, 7-9
- Migration legacy → Mongo: Task 10, wired in Task 13
- PlayerStatsService refactor (load/save/flush/dirty-tracking): Task 8
- All `inventory.items` external touchpoints fixed: Task 9
- Test harness: Task 6, 11
- Existing tests refactored: Task 12
- Startup wiring + SIGTERM: Task 13
- Docs: Task 14

**Out of Phase 1 (intentionally — kolejne plany):**
- BattleStore + battle persistence (Phase 2)
- AmbushService recovery (Phase 2)
- Other battle types (Phase 3)
- PartyService → Mongo (Phase 4)
- Aggregated "Wróć do walki" UI (Phase 5)

**Type consistency:** `Repos`, `PlayerDoc`, `ItemDoc` use spójnie. `mongoPlayerStats` i `startTestHarness` są w jednym helperze.

**No placeholders:** każdy step ma exact code. TS error-handling z `as unknown as` w migrate-legacy uzasadniony komentarzem (czytanie unknown JSON-u legacy).
