# Mongo Phase 4: PartyService → MongoDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przenieść `PartyService` z pliku JSON na MongoDB, żeby party przeżywały restart bota — wymóg dla pełnej recovery walk party-based ekspedycji.

**Architecture:** Nowa kolekcja `parties` (klucz: partyId), `PartyRepo` jako wrapper, `PartyService` refaktor analogicznie do `PlayerStatsService` z Phase 1: in-RAM Map jako SoT, `load()` async na starcie, `save()` fire-and-forget z dirty trackingiem (już per-party — `Map<partyId, lastJson>`). Migracja legacy `data/parties.json` (jeśli istnieje) → Mongo z safety-net renamem.

**Tech Stack:** mongodb driver, BattleStore z Phase 1.

**Spec:** [`docs/superpowers/specs/2026-05-07-mongo-migration-and-battle-persistence-design.md`](../specs/2026-05-07-mongo-migration-and-battle-persistence-design.md) (Rollout faza 4)

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/persistence/repos/party.repo.ts` | `PartyRepo` — typed wrapper na `Collection<PartyDoc>` |
| `test/unit/party-repo.test.ts` | Unit tests dla repo |

**Modify:**

| Path | Change |
| --- | --- |
| `src/modules/game/services/party.ts` | Konstruktor przyjmuje `PartyRepo`. `load()` async z Mongo. `save()` fire-and-forget upsert/delete z dirty tracking. Migracja legacy `data/parties.json` w `migrate-legacy.ts`. |
| `src/persistence/repos/index.ts` | Dodaj `party: PartyRepo` do `Repos`. Dodaj `repos.party.createIndexes()` do `ensureIndexes`. |
| `src/persistence/migrate-legacy.ts` | Dodaj migrację `data/parties.json` → `parties` collection. |
| `src/modules/game/index.ts` | `new PartyService(repos.party)` + `await party.load()`. |
| `test/feature/dungeon-party-gating.test.ts` | Zastąp `tmpPartyFile()` Mongo party harnessem (lub zostaw tmpPartyFile jako legacy oddzielnie wybudowany — sprawdź). |

---

### Task 1: PartyRepo

**Files:**
- Create: `src/persistence/repos/party.repo.ts`
- Test: `test/unit/party-repo.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/unit/party-repo.test.ts
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { PartyRepo, type PartyDoc } from '../../src/persistence/repos/party.repo.js';

describe('PartyRepo', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let repo: PartyRepo;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 60_000);
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    env = await harness.newEnv();
    repo = env.repos.party;
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
    await repo.upsert(seed('p1'));
    await repo.upsert(seed('p2'));
    const all = await repo.findAll();
    expect(all.map((p) => p._id).sort()).toEqual(['p1', 'p2']);
  });

  it('upsert overwrites by _id', async () => {
    await repo.upsert(seed('p1', ['a']));
    await repo.upsert({ ...seed('p1', ['a']), members: ['a', 'b'] });
    const got = await repo.findAll();
    expect(got[0].members).toEqual(['a', 'b']);
  });

  it('deleteOne removes party', async () => {
    await repo.upsert(seed('p1'));
    await repo.deleteOne('p1');
    expect(await repo.findAll()).toHaveLength(0);
  });

  it('insertMany batch', async () => {
    await repo.insertMany([seed('p1'), seed('p2'), seed('p3')]);
    expect(await repo.findAll()).toHaveLength(3);
  });

  it('createIndexes idempotent', async () => {
    await repo.createIndexes();
    await repo.createIndexes();
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Implement PartyRepo**

```typescript
// src/persistence/repos/party.repo.ts
import type { Collection } from 'mongodb';
import type { Party } from '../../modules/game/services/party.js';

export type PartyDoc = Party & { _id: string };

export class PartyRepo {
  constructor(private readonly col: Collection<PartyDoc>) {}

  async upsert(doc: PartyDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findAll(): Promise<PartyDoc[]> {
    return this.col.find().toArray();
  }

  async deleteOne(id: string): Promise<void> {
    await this.col.deleteOne({ _id: id });
  }

  async insertMany(docs: PartyDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }

  async createIndexes(): Promise<void> {
    await this.col.createIndex({ members: 1 });
  }
}
```

- [ ] **Step 3: Wire do `repos/index.ts`**

```typescript
import { PartyRepo, type PartyDoc } from './party.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
  battle: BattleRepo;
  party: PartyRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
    battle: new BattleRepo(db.collection<BattleDoc>('battles')),
    party: new PartyRepo(db.collection<PartyDoc>('parties')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  await repos.item.createIndexes();
  await repos.battle.createIndexes();
  await repos.party.createIndexes();
}

export { PlayerRepo, ItemRepo, BattleRepo, PartyRepo };
export type { PlayerDoc, ItemDoc, BattleDoc, PartyDoc };
```

- [ ] **Step 4: Run + commit**

```bash
bun test test/unit/party-repo.test.ts
git add src/persistence/repos/party.repo.ts src/persistence/repos/index.ts test/unit/party-repo.test.ts
git commit -m "feat: add PartyRepo Mongo wrapper"
```

---

### Task 2: PartyService refactor — Mongo

**Files:**
- Modify: `src/modules/game/services/party.ts`
- Modify: `src/modules/game/index.ts`
- Modify: `src/persistence/migrate-legacy.ts`

- [ ] **Step 1: Refactor PartyService konstruktor + load + save**

W `src/modules/game/services/party.ts` zastąp całą klasę:

```typescript
import type { PartyRepo } from '../../../persistence/repos/party.repo.js';

// (interface Party, MAX_PARTY, isParty, newPartyId — bez zmian)

export class PartyService {
  private readonly parties: Map<string, Party> = new Map();
  private readonly lastSavedJson = new Map<string, string>();
  private readonly toDelete = new Set<string>();
  private pendingWrites: Promise<unknown>[] = [];

  constructor(private readonly repo: PartyRepo) {}

  async load(): Promise<void> {
    this.parties.clear();
    this.lastSavedJson.clear();
    const docs = await this.repo.findAll();
    for (const doc of docs) {
      const { _id, ...rest } = doc;
      this.parties.set(_id, rest as Party);
      this.lastSavedJson.set(_id, JSON.stringify(rest));
    }
  }

  /** Sync z perspektywy callera, fire-and-forget async upsert/delete z dirty tracking. */
  save(): void {
    for (const [id, p] of this.parties) {
      const json = JSON.stringify(p);
      if (this.lastSavedJson.get(id) === json) continue;
      this.lastSavedJson.set(id, json);
      this.pendingWrites.push(
        this.repo.upsert({ ...p, _id: id }).catch((e: unknown) => {
          console.error(
            `[mongo] party save fail ${id}:`,
            e instanceof Error ? e.message : String(e),
          );
        }),
      );
    }
    for (const id of this.toDelete) {
      this.lastSavedJson.delete(id);
      this.pendingWrites.push(
        this.repo.deleteOne(id).catch((e: unknown) => {
          console.error(
            `[mongo] party delete fail ${id}:`,
            e instanceof Error ? e.message : String(e),
          );
        }),
      );
    }
    this.toDelete.clear();
  }

  async flush(): Promise<void> {
    const queue = this.pendingWrites;
    this.pendingWrites = [];
    await Promise.allSettled(queue);
  }

  // ... reszta metod (list/get/getByMember/getByPendingInvite/create/invite/accept/decline/leave/kick/disband)
  // BEZ ZMIAN — używają tylko `this.parties` Map. `save()` jest wywoływane tak samo.
  //
  // Wyjątek: `disband` i `leave` (gdy disband=true) muszą dodać id do toDelete:
  //   this.parties.delete(partyId);
  //   this.toDelete.add(partyId);
  //   this.save();
}
```

- [ ] **Step 2: Update `disband` + `leave` żeby usuwały z Mongo**

W metodach `leave` (gdy partyDisbanded) i `disband` przed `this.parties.delete(...)`:

```typescript
this.toDelete.add(party.id);
this.parties.delete(party.id);
this.save();
```

- [ ] **Step 3: Update `src/modules/game/index.ts` DI**

W `createGameServices`:

```typescript
const party = new PartyService(repos.party);
await party.load();
```

W `src/index.ts` dodaj `party.flush()` do shutdown handler.

- [ ] **Step 4: Add legacy migration dla `data/parties.json`**

W `src/persistence/migrate-legacy.ts` dodaj nową funkcję + wywołaj z `migrateLegacyJsonIfNeeded`:

```typescript
async function migrateLegacyPartiesIfNeeded(repos: Repos, rootDir: string): Promise<void> {
  const file = path.join(rootDir, 'parties.json');
  if (!fs.existsSync(file)) return;
  if ((await repos.party.findAll()).length > 0) return; // już zmigrowane

  const arr: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(arr)) return;

  const docs = arr
    .filter((p): p is { id: string } => !!p && typeof p === 'object' && 'id' in p && typeof (p as { id: unknown }).id === 'string')
    .map((p) => ({ ...(p as PartyDoc), _id: (p as { id: string }).id }));

  if (docs.length > 0) await repos.party.insertMany(docs);
  fs.renameSync(file, `${file}.migrated-${Date.now()}`);
  console.log(`[mongo] migrated ${docs.length} parties`);
}
```

Wywołanie w `migrateLegacyJsonIfNeeded`:

```typescript
export async function migrateLegacyJsonIfNeeded(
  repos: Repos,
  rootDir: string = path.resolve('data'),
): Promise<void> {
  // ... istniejąca logika dla players/items
  await migrateLegacyPartiesIfNeeded(repos, rootDir);
}
```

- [ ] **Step 5: Update test `test/feature/dungeon-party-gating.test.ts`**

Test używa `tmpPartyFile()` które konstruuje JSON file path. Zastąp:

```typescript
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';
import { PartyService } from '../../src/modules/game/services/party.js';

// ... w beforeEach:
testCtx = await mongoPlayerStats();
party = new PartyService(testCtx.env.repos.party);
await party.load();
```

Usuń `tmpPartyFile()` function i jej imports (`os`, `path`).

- [ ] **Step 6: Run typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 365/365 + 5 nowych = 370/370.

- [ ] **Step 7: Commit**

```bash
git add src/modules/game/services/party.ts src/modules/game/index.ts src/persistence/migrate-legacy.ts src/index.ts test/feature/dungeon-party-gating.test.ts
git commit -m "refactor: PartyService → Mongo (party collection + legacy migration)"
```

---

### Task 3: Final verification

- [ ] **Step 1: typecheck + lint + tests**

```bash
bun run tsc --noEmit
bun run lint
bun test
```

Expected: zielono.

---

## Self-review

**Spec coverage:** PartyService persistance + index `{members:1}` + migration legacy. ✅

**Type consistency:** `PartyDoc = Party & { _id: string }` — jednolita konwencja z Phase 1.
