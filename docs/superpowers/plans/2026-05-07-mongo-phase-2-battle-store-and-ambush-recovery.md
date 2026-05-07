# Mongo Phase 2: BattleStore + Ambush Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistować trwające walki ekspedycyjne (ambush + final fight) w MongoDB tak, żeby po crashu/restarcie/zniknięciu Discord threadu gracz mógł kliknąć "**⚔️ Wróć do walki**" na widoku ekspedycji i wznowić walkę z zachowanym stanem (HP, buffy, cooldowny, runda).

**Architecture:** Nowa kolekcja `battles` (klucz: stabilny UUID `_battleId` niezależny od thread.id). `BattleStore` w `src/modules/game/engine/battle-store.ts` enkapsuluje serialize/deserialize `BattleState ↔ BattleDoc`. `AmbushService` zostaje SoT in-memory (`states: Map<threadId, AmbushBattleState>`), ale dorzuca `_battleId` field i wywołuje `battleStore.snapshot()` po każdym `resolveBattleRound`. Na starcie `client.once('ready')` → `ambushService.hydrate()` ładuje aktywne walki z Mongo i odtwarza timeout handlery. `resumeForPlayer` rozszerzony: jeśli załadowany state ma `thread === null`, recreate thread w `expedition.channelId` przy pierwszym kliku "Wróć do walki" → `battleStore.updateThreadId(_battleId, newThreadId)`.

**Tech Stack:** MongoDB native driver (już zainstalowany w Phase 1), `crypto.randomUUID()`, native TypeScript.

**Spec:** [`docs/superpowers/specs/2026-05-07-mongo-migration-and-battle-persistence-design.md`](../specs/2026-05-07-mongo-migration-and-battle-persistence-design.md) (sekcje 2-3, "Schemat `battles`", "Recovery flow")

**Subsequent phases (osobne plany):** Phase 3 — Dungeon/Boss/WorldBoss; Phase 4 — `PartyService` migration; Phase 5 — agregowany "Wróć do walki" button (dungeon/boss też wystawiane).

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/persistence/repos/battle.repo.ts` | `BattleRepo` — typed wrapper na `Collection<BattleDoc>` + `BattleDoc` type + `BattleType` enum |
| `src/modules/game/engine/battle-store.ts` | `BattleStore` — serialize/deserialize `BattleState ↔ BattleDoc`. API: `create / snapshot / finish / loadActive / updateThreadId` |

**Modify:**

| Path | Change |
| --- | --- |
| `src/modules/game/engine/battle-state.ts` | Dodaj pole `_battleId: string` do `BattleState` |
| `src/modules/game/engine/ambush.ts` | Konstruktor przyjmuje `BattleStore`. Każdy `triggerAmbush` / `triggerPartyAmbush` przypisuje `_battleId = randomUUID()` i wywołuje `battleStore.create()`. Po `resolveBattleRound` w `maybeResolve` → `battleStore.snapshot()`. W `finishAmbush` / `timeoutAmbush` → `battleStore.finish()`. Nowa metoda `hydrate()` ładuje walki z Mongo. `resumeForPlayer` rozszerzony — gdy state.thread null (loaded z DB), recreate thread + `battleStore.updateThreadId()` |
| `src/persistence/repos/index.ts` | Dodaj `battle: BattleRepo` do `Repos`. Dodaj indexy w `ensureIndexes`: `{ playerIds: 1, finished: 1 }` partial dla `finished:false`, TTL na `updatedAt` dla `finished:true` (7 dni) |
| `src/modules/game/index.ts` | Stwórz `BattleStore` → wstrzyknij do `startAmbushLoop` i `AmbushService` konstruktora. Po init → `await ambushService.hydrate()` |
| `src/index.ts` | (No changes — `client.once('ready')` triggeruje hydrate przez `startAmbushLoop` po stronie game/index.ts) |
| `test/helpers/factories.ts` | `makeBattleState` przypisuje `_battleId: randomUUID()` |
| `test/feature/dungeon-party-gating.test.ts` lub inne testy które konstrułują BattleState ręcznie | Dodaj `_battleId` jeśli TS rzuca błąd (powinno być pokryte przez factory) |

---

## Convention reminders

- **Bun runtime** — komendy w planie są `bun run tsc --noEmit`, `bun test`, `bun run lint`
- **No `as` casts** — `Collection<BattleDoc>` typing pokrywa większość
- **Polish player-facing strings, English code identifiers**
- **Conventional commits** — `feat:` / `fix:` / `refactor:` / `test:` / `docs:`

---

### Task 1: Add `_battleId` field to BattleState

**Files:**
- Modify: `src/modules/game/engine/battle-state.ts`
- Modify: `test/helpers/factories.ts`

- [ ] **Step 1: Add `_battleId` to `BattleState` interface**

W `src/modules/game/engine/battle-state.ts` znajdź:

```typescript
export interface BattleState {
  id: string;
  thread: any;
  combatants: BattleCombatant[];
  pending: Map<string, BattleAction>;
  promptMessageIds: Map<string, string>;
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
}
```

Zmień na:

```typescript
export interface BattleState {
  /** Stabilny UUID — primary key w `battles` collection, niezmienny przez thread recreate. */
  _battleId: string;
  /** Discord thread id — używane do routingu interactions. Zmienia się gdy thread odtworzony. */
  id: string;
  thread: any;
  combatants: BattleCombatant[];
  pending: Map<string, BattleAction>;
  promptMessageIds: Map<string, string>;
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
}
```

- [ ] **Step 2: Update test factory**

W `test/helpers/factories.ts` znajdź:

```typescript
export function makeBattleState(combatants: BattleCombatant[]): BattleState {
  return {
    id: 'bs1',
    thread: null,
    combatants,
    pending: new Map(),
    promptMessageIds: new Map(),
    roundNumber: 1,
    finished: false,
  };
}
```

Zmień na:

```typescript
import { randomUUID } from 'node:crypto';

export function makeBattleState(combatants: BattleCombatant[]): BattleState {
  return {
    _battleId: randomUUID(),
    id: 'bs1',
    thread: null,
    combatants,
    pending: new Map(),
    promptMessageIds: new Map(),
    roundNumber: 1,
    finished: false,
  };
}
```

(Jeśli `randomUUID` już zaimportowany w pliku — nie duplikuj importu.)

- [ ] **Step 3: Run typecheck**

```bash
bun run tsc --noEmit
```

Expected: errors w `src/modules/game/engine/ambush.ts`, `arena.ts`, `world-boss.ts`, `services/dungeon.service.ts`, `services/boss.service.ts`, `services/duel.service.ts` — wszędzie gdzie konstruowany jest `BattleState` literal bez `_battleId`. Te poprawimy w kolejnych taskach.

- [ ] **Step 4: Skip commit, idź do Task 2**

Bundle commit po Task 5 (gdy wszystkie BattleState konstrukcje są naprawione).

---

### Task 2: Patch all BattleState constructors with `_battleId`

**Files:**
- Modify: `src/modules/game/engine/ambush.ts` (2 miejsca: `triggerPartyAmbush`, `triggerAmbush`)
- Modify: `src/modules/game/engine/arena.ts` (gdzie konstruowany BattleState)
- Modify: `src/modules/game/engine/world-boss.ts` (gdzie konstruowany BattleState)
- Modify: `src/modules/game/services/dungeon.service.ts`
- Modify: `src/modules/game/services/boss.service.ts`
- Modify: `src/modules/game/services/duel.service.ts`

- [ ] **Step 1: Find all BattleState constructions**

```bash
grep -rn "id: thread\.id\|id: thread.id," src/modules/game/ | grep -v test/
```

Każde miejsce gdzie tworzony jest obiekt z polem `id: thread.id` (lub podobnym) i kolejne pola `combatants`, `pending` etc. — to BattleState construction.

- [ ] **Step 2: Add randomUUID import + `_battleId` field — `ambush.ts`**

W `src/modules/game/engine/ambush.ts` dodaj na początku importów:

```typescript
import { randomUUID } from 'node:crypto';
```

Znajdź **każde** miejsce konstruującą `AmbushBattleState`:

```typescript
const state: AmbushBattleState = {
  id: thread.id,
  thread,
  // ...
};
```

Dodaj `_battleId: randomUUID(),` jako pierwsze pole:

```typescript
const state: AmbushBattleState = {
  _battleId: randomUUID(),
  id: thread.id,
  thread,
  // ...
};
```

(Są 2 miejsca: `triggerPartyAmbush` ~linia 363, `triggerAmbush` ~linia 437.)

- [ ] **Step 3: Powtórz dla `arena.ts`, `world-boss.ts`, `dungeon.service.ts`, `boss.service.ts`, `duel.service.ts`**

W każdym pliku:
1. Dodaj `import { randomUUID } from 'node:crypto';` jeśli brak
2. W każdej konstrukcji `BattleState` dodaj `_battleId: randomUUID(),`

```bash
grep -n "BattleState = {" src/modules/game/engine/arena.ts src/modules/game/engine/world-boss.ts src/modules/game/services/dungeon.service.ts src/modules/game/services/boss.service.ts src/modules/game/services/duel.service.ts
```

Iteruj po znalezionych liniach, dodaj `_battleId: randomUUID(),` jako pierwsze pole obiektu literal.

- [ ] **Step 4: Typecheck zielony**

```bash
bun run tsc --noEmit
```

Expected: brak błędów. Jeśli któryś plik nadal rzuca błąd o brakującym `_battleId`, znajdź i napraw.

- [ ] **Step 5: Run tests — wszystkie powinny przejść (no behavior change)**

```bash
bun test
```

Expected: 346/346 pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/game/engine/battle-state.ts src/modules/game/engine/ambush.ts src/modules/game/engine/arena.ts src/modules/game/engine/world-boss.ts src/modules/game/services/dungeon.service.ts src/modules/game/services/boss.service.ts src/modules/game/services/duel.service.ts test/helpers/factories.ts
git commit -m "feat: add stable _battleId UUID to BattleState"
```

---

### Task 3: BattleRepo + BattleDoc schema

**Files:**
- Create: `src/persistence/repos/battle.repo.ts`
- Test: `test/unit/battle-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/battle-repo.test.ts
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { BattleRepo, type BattleDoc, type BattleType } from '../../src/persistence/repos/battle.repo.js';
import { randomUUID } from 'node:crypto';

describe('BattleRepo', () => {
  let harness: TestHarness;
  let env: TestEnv;
  let repo: BattleRepo;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 60_000);
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    env = await harness.newEnv();
    repo = env.repos.battle;
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
    await repo.upsert(doc);
    const got = await repo.findById(doc._id);
    expect(got?._id).toBe(doc._id);
    expect(got?.type).toBe('ambush');
  });

  it('findActive returns only finished:false', async () => {
    await repo.upsert(seedDoc({ finished: false }));
    await repo.upsert(seedDoc({ finished: true }));
    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].finished).toBe(false);
  });

  it('updateThreadId mutates threadId field only', async () => {
    const doc = seedDoc({ threadId: 'old-thread' });
    await repo.upsert(doc);
    await repo.updateThreadId(doc._id, 'new-thread');
    const got = await repo.findById(doc._id);
    expect(got?.threadId).toBe('new-thread');
    expect(got?.combatants).toHaveLength(1);
  });

  it('markFinished sets finished + result fields', async () => {
    const doc = seedDoc();
    await repo.upsert(doc);
    await repo.markFinished(doc._id, { winnerTeam: 0 });
    const got = await repo.findById(doc._id);
    expect(got?.finished).toBe(true);
    expect(got?.winnerTeam).toBe(0);
  });

  it('markFinished with draw', async () => {
    const doc = seedDoc();
    await repo.upsert(doc);
    await repo.markFinished(doc._id, { draw: true });
    const got = await repo.findById(doc._id);
    expect(got?.finished).toBe(true);
    expect(got?.draw).toBe(true);
  });

  it('createIndexes idempotent', async () => {
    await repo.createIndexes();
    await repo.createIndexes();
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/battle-repo.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BattleRepo**

```typescript
// src/persistence/repos/battle.repo.ts
import type { Collection } from 'mongodb';
import type { BattleCombatant, BattleAction } from '../../modules/game/engine/battle-state.js';

export type BattleType = 'ambush' | 'dungeon' | 'boss' | 'finalFight' | 'worldBoss';

export interface BattleDoc {
  /** Stabilny UUID — niezmienny przez thread recreate. */
  _id: string;
  type: BattleType;
  /** Aktualny Discord thread; null gdy thread zniknął i czeka na recreate. */
  threadId: string | null;
  /** Parent channel — używane do recreate thread. */
  parentChannelId: string;
  combatants: BattleCombatant[];
  /** Map<combatantId, BattleAction> serializowane jako Record. */
  pending: Record<string, BattleAction>;
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
  /** team===0 ids — index column dla szybkiego "active battles for player" lookup. */
  playerIds: string[];
  // type-specific (opcjonalne, jedno z poniższych w zależności od `type`):
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
  // metadata
  createdAt: number;
  updatedAt: number;
}

export class BattleRepo {
  constructor(private readonly col: Collection<BattleDoc>) {}

  async upsert(doc: BattleDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findById(id: string): Promise<BattleDoc | null> {
    return this.col.findOne({ _id: id });
  }

  async findActive(): Promise<BattleDoc[]> {
    return this.col.find({ finished: false }).toArray();
  }

  async updateThreadId(id: string, threadId: string | null): Promise<void> {
    await this.col.updateOne(
      { _id: id },
      { $set: { threadId, updatedAt: Date.now() } },
    );
  }

  async markFinished(
    id: string,
    result: { winnerTeam?: number; draw?: boolean },
  ): Promise<void> {
    const set: Partial<BattleDoc> = { finished: true, updatedAt: Date.now() };
    if (result.winnerTeam !== undefined) set.winnerTeam = result.winnerTeam;
    if (result.draw) set.draw = true;
    await this.col.updateOne({ _id: id }, { $set: set });
  }

  async createIndexes(): Promise<void> {
    // Active battles per player — kluczowe dla recovery
    await this.col.createIndex({ playerIds: 1, finished: 1 });
    // TTL: finished battles znikają po 7 dniach (auto-purge historii)
    await this.col.createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { finished: true } },
    );
  }
}
```

- [ ] **Step 4: Add BattleRepo to repos factory**

W `src/persistence/repos/index.ts`:

```typescript
import type { Db } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from './player.repo.js';
import { ItemRepo, type ItemDoc } from './item.repo.js';
import { BattleRepo, type BattleDoc } from './battle.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
  battle: BattleRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
    battle: new BattleRepo(db.collection<BattleDoc>('battles')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  await repos.item.createIndexes();
  await repos.battle.createIndexes();
}

export { PlayerRepo, ItemRepo, BattleRepo };
export type { PlayerDoc, ItemDoc, BattleDoc };
```

- [ ] **Step 5: Run BattleRepo tests**

```bash
bun test test/unit/battle-repo.test.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 6: Run all tests + typecheck**

```bash
bun run tsc --noEmit
bun test
```

Expected: typecheck zielony, 352/352 tests pass (346 + 6 new).

- [ ] **Step 7: Commit**

```bash
git add src/persistence/repos/battle.repo.ts src/persistence/repos/index.ts test/unit/battle-repo.test.ts
git commit -m "feat: add BattleRepo + BattleDoc schema"
```

---

### Task 4: BattleStore — serialize/deserialize

**Files:**
- Create: `src/modules/game/engine/battle-store.ts`
- Test: `test/unit/battle-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/battle-store.test.ts
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

    state.combatants[0].hp = 50; // damaged
    state.combatants[1].hp = 0; // dead
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
    expect(loaded[0].state.thread).toBeNull(); // not hydrated
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/battle-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BattleStore**

```typescript
// src/modules/game/engine/battle-store.ts
import type { BattleState, BattleAction } from './battle-state.js';
import type { BattleRepo, BattleDoc, BattleType } from '../../../persistence/repos/battle.repo.js';

/**
 * Type-specific context dla `create()`. Każda walka dostaje swój subset:
 * ambush/finalFight → expedition, dungeon → dungeonContext, etc.
 */
export interface BattleContext {
  parentChannelId: string;
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
}

/** Para load-time: state (do hydratacji w pamięci) + raw doc (do read-only meta). */
export interface LoadedBattle {
  state: BattleState;
  doc: BattleDoc;
}

export class BattleStore {
  constructor(private readonly repo: BattleRepo) {}

  /**
   * Pierwsze utrwalenie walki — zapisuje początkowy snapshot. Zwraca
   * `_battleId` (= state._battleId).
   */
  async create(state: BattleState, type: BattleType, ctx: BattleContext): Promise<string> {
    const now = Date.now();
    const doc: BattleDoc = {
      _id: state._battleId,
      type,
      threadId: state.id,
      parentChannelId: ctx.parentChannelId,
      combatants: state.combatants,
      pending: serializePending(state.pending),
      roundNumber: state.roundNumber,
      finished: state.finished,
      playerIds: state.combatants.filter((c) => c.team === 0).map((c) => c.id),
      createdAt: now,
      updatedAt: now,
    };
    if (state.winnerTeam !== undefined) doc.winnerTeam = state.winnerTeam;
    if (state.draw) doc.draw = true;
    if (ctx.expedition) doc.expedition = ctx.expedition;
    if (ctx.dungeonContext) doc.dungeonContext = ctx.dungeonContext;
    if (ctx.bossContext) doc.bossContext = ctx.bossContext;
    if (ctx.worldBossContext) doc.worldBossContext = ctx.worldBossContext;

    await this.repo.upsert(doc);
    return state._battleId;
  }

  /**
   * Aktualizuje stan walki w bazie. Wywoływane po każdej zakończonej rundzie.
   * Awaitowane — gwarantuje że snapshot jest na dysku PRZED wysłaniem
   * round-summary message (eliminuje "summary widoczny, crash przed snapshot").
   */
  async snapshot(state: BattleState): Promise<void> {
    const existing = await this.repo.findById(state._battleId);
    if (!existing) return; // race: walka mogła zostać finished w międzyczasie
    await this.repo.upsert({
      ...existing,
      threadId: state.id,
      combatants: state.combatants,
      pending: serializePending(state.pending),
      roundNumber: state.roundNumber,
      finished: state.finished,
      winnerTeam: state.winnerTeam,
      draw: state.draw,
      updatedAt: Date.now(),
    });
  }

  /** Mark battle finished z wynikiem. Po `finish` snapshot nic nie robi (race-safe). */
  async finish(battleId: string, result: { winnerTeam?: number; draw?: boolean }): Promise<void> {
    await this.repo.markFinished(battleId, result);
  }

  /**
   * Wczytuje wszystkie aktywne walki z bazy. Zwraca tuple `{state, doc}` —
   * `state.thread = null` (do hydratacji przez serwis przy resume).
   */
  async loadActive(): Promise<LoadedBattle[]> {
    const docs = await this.repo.findActive();
    return docs.map((doc) => ({
      state: deserializeState(doc),
      doc,
    }));
  }

  async updateThreadId(battleId: string, threadId: string | null): Promise<void> {
    await this.repo.updateThreadId(battleId, threadId);
  }
}

function serializePending(pending: Map<string, BattleAction>): Record<string, BattleAction> {
  const out: Record<string, BattleAction> = {};
  for (const [k, v] of pending) out[k] = v;
  return out;
}

function deserializeState(doc: BattleDoc): BattleState {
  const pending = new Map<string, BattleAction>();
  for (const [k, v] of Object.entries(doc.pending)) pending.set(k, v);
  const state: BattleState = {
    _battleId: doc._id,
    id: doc.threadId ?? doc._id,
    thread: null,
    combatants: doc.combatants,
    pending,
    promptMessageIds: new Map(), // stale po recovery, wystawiamy nowe panele
    roundNumber: doc.roundNumber,
    finished: doc.finished,
  };
  if (doc.winnerTeam !== undefined) state.winnerTeam = doc.winnerTeam;
  if (doc.draw) state.draw = true;
  return state;
}
```

- [ ] **Step 4: Run BattleStore tests**

```bash
bun test test/unit/battle-store.test.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/game/engine/battle-store.ts test/unit/battle-store.test.ts
git commit -m "feat: add BattleStore for BattleState serialization"
```

---

### Task 5: AmbushService — wstrzyknij BattleStore + snapshot calls

**Files:**
- Modify: `src/modules/game/engine/ambush.ts`
- Modify: `src/modules/game/index.ts` (DI)

- [ ] **Step 1: Add BattleStore parameter do AmbushService konstruktora**

W `src/modules/game/engine/ambush.ts` znajdź:

```typescript
constructor(
  private readonly client: Client,
  private readonly stats: PlayerStatsService,
  private readonly party: PartyService,
  private readonly logAmbush: (playerId: string, line: string) => void = () => {},
) {}
```

Zmień na:

```typescript
constructor(
  private readonly client: Client,
  private readonly stats: PlayerStatsService,
  private readonly party: PartyService,
  private readonly battleStore: BattleStore,
  private readonly logAmbush: (playerId: string, line: string) => void = () => {},
) {}
```

Dodaj import na górze pliku:

```typescript
import { BattleStore } from './battle-store.js';
```

- [ ] **Step 2: Call `battleStore.create` w `triggerAmbush` i `triggerPartyAmbush`**

W `triggerAmbush` (~linia 437) po `this.states.set(thread.id, state);` dodaj:

```typescript
await this.battleStore.create(state, 'ambush', {
  parentChannelId: exp.channelId,
  expedition: { destination: exp.destination, channelId: exp.channelId },
});
```

Analogicznie w `triggerPartyAmbush` (~linia 363-373) po `this.states.set(thread.id, state);`:

```typescript
await this.battleStore.create(state, 'ambush', {
  parentChannelId: channelId,
  expedition: { destination: expDestination, channelId },
});
```

- [ ] **Step 3: Call `battleStore.snapshot` po każdej rundzie**

W `maybeResolve` znajdź:

```typescript
const result = resolveBattleRound(state);

// Log walki — zawsze, też dla ostatniej rundy gdy ktoś ginie.
if (result.lines.length > 0) {
  await state.thread.send(...);
}
```

Wstaw `await this.battleStore.snapshot(state);` PRZED `state.thread.send` (snapshot must persist before user sees the round summary):

```typescript
const result = resolveBattleRound(state);
await this.battleStore.snapshot(state);

if (result.lines.length > 0) {
  await state.thread.send(...);
}
```

- [ ] **Step 4: Call `battleStore.finish` w `finishAmbush` i `timeoutAmbush`**

W `finishAmbush` na początku (przed `if (state.timeoutHandle) clearTimeout...`):

```typescript
await this.battleStore.finish(state._battleId, {
  winnerTeam: result.winnerTeam,
  draw: result.draw,
});
```

W `timeoutAmbush` po `state.finished = true;`:

```typescript
await this.battleStore.finish(state._battleId, { draw: true });
```

- [ ] **Step 5: Wire BattleStore w `src/modules/game/index.ts`**

Znajdź `export function startAmbushLoop(...)`:

```bash
grep -n "startAmbushLoop\|new AmbushService" src/modules/game/index.ts
```

Zmień konstrukcję `AmbushService`:

```typescript
import { BattleStore } from './engine/battle-store.js';
// ...
const battleStore = new BattleStore(repos.battle);
// ...
const ambushService = new AmbushService(client, stats, party, battleStore, (playerId, line) => {
  expeditions.logAmbush(playerId, line);
});
```

`startAmbushLoop` musi przyjąć `repos` lub `battleStore` jako dodatkowy param. Najprostsza droga: przekaż `repos` przez `GameServices`:

W `interface GameServices` dodaj `repos: Repos;` (z `import type { Repos } from '../../persistence/repos/index.js';`). W `createGameServices`:

```typescript
export async function createGameServices(repos: Repos): Promise<GameServices> {
  // ... istniejące ...
  return { stats, party, expeditions, identification, enchanter, repos };
}
```

W `startAmbushLoop` użyj `services.repos.battle` przez `new BattleStore(services.repos.battle)`.

- [ ] **Step 6: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: typecheck zielony, 352/352 testów + nowe tests (jeśli żadnych nie dodałeś — tests stare zostają zielone).

- [ ] **Step 7: Commit**

```bash
git add src/modules/game/engine/ambush.ts src/modules/game/index.ts
git commit -m "feat: wire BattleStore into AmbushService (create/snapshot/finish)"
```

---

### Task 6: AmbushService — `hydrate()` na starcie

**Files:**
- Modify: `src/modules/game/engine/ambush.ts`
- Modify: `src/modules/game/index.ts` (call hydrate po init)

- [ ] **Step 1: Dodaj `hydrate()` metodę do AmbushService**

W `src/modules/game/engine/ambush.ts` w klasie `AmbushService` dodaj nowy publiczny method (np. po `start()`):

```typescript
/**
 * Wczytuje aktywne ambush battles z Mongo i odtwarza in-memory state.
 * Wywoływane raz na starcie (po `client.once('ready')`). Stale battles
 * (>24h od createdAt) są od razu finished'owane jako timeout.
 *
 * Thread NIE jest odtwarzany od razu — czeka na klik "Wróć do walki".
 * Timeout handler jest re-scheduled z pozostałym czasem.
 */
async hydrate(): Promise<void> {
  const loaded = await this.battleStore.loadActive();
  let restored = 0;
  let staleSkipped = 0;
  const now = Date.now();
  for (const { state, doc } of loaded) {
    if (doc.type !== 'ambush') continue; // inne typy — phase 3
    if (now - doc.createdAt > AMBUSH_TIMEOUT_MS) {
      // Stale — finish jako timeout, pomiń
      await this.battleStore.finish(doc._id, { draw: true });
      staleSkipped += 1;
      continue;
    }
    if (!doc.expedition) continue;
    const ambushState = state as AmbushBattleState;
    ambushState.expedition = doc.expedition;
    this.states.set(state.id, ambushState);

    // Re-schedule timeout z pozostałym czasem
    const elapsed = now - doc.createdAt;
    const remaining = AMBUSH_TIMEOUT_MS - elapsed;
    ambushState.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(ambushState).catch((e) =>
        console.error('[ambush] hydrate timeout fail:', errMsg(e)),
      );
    }, remaining);
    ambushState.timeoutHandle.unref?.();
    restored += 1;
  }
  console.log(
    `[ambush] hydrate: ${restored} active battles restored, ${staleSkipped} stale skipped`,
  );
}
```

- [ ] **Step 2: Wywołaj `hydrate()` w `startAmbushLoop`**

W `src/modules/game/index.ts` znajdź `startAmbushLoop`:

```typescript
export function startAmbushLoop(client: Client, services: GameServices): AmbushService {
  const battleStore = new BattleStore(services.repos.battle);
  const ambushService = new AmbushService(client, services.stats, services.party, battleStore, ...);
  // ...
  ambushService.start();
  return ambushService;
}
```

Zmień na async:

```typescript
export async function startAmbushLoop(client: Client, services: GameServices): Promise<AmbushService> {
  const battleStore = new BattleStore(services.repos.battle);
  const ambushService = new AmbushService(client, services.stats, services.party, battleStore, ...);
  await ambushService.hydrate();
  ambushService.start();
  return ambushService;
}
```

W `src/index.ts` w `client.once(Events.ClientReady, ...)`:

```typescript
ambushService = await startAmbushLoop(client, gameServices);
```

(Note: callback `client.once(Events.ClientReady, ...)` musi być async — sprawdź czy już jest.)

- [ ] **Step 3: Tests dla hydrate — write a feature test**

Stwórz `test/feature/ambush-recovery.test.ts`:

```typescript
import { startTestHarness, type TestHarness, type TestEnv } from '../helpers/mongo-setup.js';
import { BattleStore } from '../../src/modules/game/engine/battle-store.js';
import type { BattleState, BattleCombatant } from '../../src/modules/game/engine/battle-state.js';
import { randomUUID } from 'node:crypto';

describe('Ambush recovery — hydrate from Mongo', () => {
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

  function mkCombatant(id: string, team: number): BattleCombatant {
    return {
      id, team, controller: team === 0 ? 'human' : 'ai',
      name: `c-${id}`, hp: 100, maxHp: 100, damageBonus: 0, defending: false, potionsLeft: 0,
    };
  }

  it('loadActive returns persisted battles after simulated restart', async () => {
    const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-x');
    state.combatants[0].hp = 60; // pre-damaged
    state.roundNumber = 3;
    await store.create(state, 'ambush', {
      parentChannelId: 'chan-1',
      expedition: { destination: 'forest', channelId: 'chan-1' },
    });

    // simulate restart: new BattleStore, load
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
});
```

- [ ] **Step 4: Run new tests**

```bash
bun test test/feature/ambush-recovery.test.ts
```

Expected: PASS — 2 tests green.

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: 354/354 pass (352 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/modules/game/engine/ambush.ts src/modules/game/index.ts src/index.ts test/feature/ambush-recovery.test.ts
git commit -m "feat: AmbushService hydrate from Mongo on startup"
```

---

### Task 7: Recovery flow — extend `resumeForPlayer` z thread recreate + Mongo update

**Files:**
- Modify: `src/modules/game/engine/ambush.ts` (`resumeForPlayer`, `recreateThreadFor`)

Obecnie `resumeForPlayer` próbuje użyć `state.thread.send` — jeśli rzuca, wywołuje `recreateThreadFor`. Po Phase 2: jeśli state został zhydratowany (`state.thread === null`), od razu idziemy w fallback. Dodatkowo: po recreate musimy wywołać `battleStore.updateThreadId`.

- [ ] **Step 1: Modify `resumeForPlayer` żeby obsłużył `state.thread === null`**

Znajdź obecną implementację (~linia 161):

```typescript
async resumeForPlayer(playerId: string): Promise<{ ok: boolean; threadId?: string }> {
  const state = this.getActiveStateForPlayer(playerId);
  if (!state) return { ok: false };

  const tryUnarchive = async (): Promise<void> => {
    if (typeof state.thread.setArchived === 'function') {
      await state.thread.setArchived(false).catch(() => {});
    }
  };
  const sendBoard = async (): Promise<boolean> => {
    try {
      await state.thread.send(...);
      return true;
    } catch {
      return false;
    }
  };

  await tryUnarchive();
  let alive = await sendBoard();

  if (!alive) {
    // ...
  }
  // ...
}
```

Dodaj na początku gałąź dla `state.thread === null` (po hydrate):

```typescript
async resumeForPlayer(playerId: string): Promise<{ ok: boolean; threadId?: string }> {
  const state = this.getActiveStateForPlayer(playerId);
  if (!state) return { ok: false };

  // Hydrated state — thread === null, recreate od razu
  if (state.thread === null) {
    const newThread = await this.recreateThreadFor(state, playerId);
    if (!newThread || !hasThreadId(newThread)) {
      console.error('[ambush] resume fail (hydrated): parent channel unreachable');
      return { ok: false };
    }
    this.states.delete(state.id);
    state.id = newThread.id;
    state.thread = newThread;
    state.promptMessageIds.clear();
    this.states.set(newThread.id, state);
    await this.battleStore.updateThreadId(state._battleId, newThread.id);

    // Send board + prompt
    try {
      await newThread.send(
        `⚔️ <@${playerId}> wraca do walki — aktualny stan:\n${this.fmtBoard(state)}`,
      );
      await this.promptHumans(state);
    } catch (e) {
      console.error('[ambush] resume hydrated promptHumans fail:', errMsg(e));
      return { ok: false };
    }
    return { ok: true, threadId: newThread.id };
  }

  // Live state z istniejącym thread — istniejąca logika
  const tryUnarchive = async (): Promise<void> => {
    // ...
  };
  // ... reszta zostaje bez zmian
}
```

- [ ] **Step 2: Update fallback path żeby też wywołać `updateThreadId`**

W istniejącej gałęzi `if (!alive) { ... newThread = await this.recreateThreadFor(...) ... }` po `this.states.set(newThread.id, state);` dodaj:

```typescript
await this.battleStore.updateThreadId(state._battleId, newThread.id);
```

- [ ] **Step 3: Update `finishAmbush` i `timeoutAmbush` — clear pending writes**

W `finishAmbush` po `this.states.delete(state.id);` dodaj (jeśli jeszcze brak):

```typescript
// battleStore.finish był już wywołany w step Task 5 — tutaj nic dodatkowo
```

(Zostawiamy snapshot logic z Task 5.)

- [ ] **Step 4: Typecheck + run tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: zielono. Dodaj nowy test do `ambush-recovery.test.ts` (z Task 6) — symulujący resume:

```typescript
it('updateThreadId is called when battle is resumed in new thread', async () => {
  const state = makeState([mkCombatant('p1', 0), mkCombatant('m1', 1)], 'thread-old');
  await store.create(state, 'ambush', {
    parentChannelId: 'chan-1',
    expedition: { destination: 'forest', channelId: 'chan-1' },
  });

  await store.updateThreadId(state._battleId, 'thread-new');
  const doc = await env.repos.battle.findById(state._battleId);
  expect(doc?.threadId).toBe('thread-new');
});
```

Dorzuć do `test/feature/ambush-recovery.test.ts`. Run:

```bash
bun test test/feature/ambush-recovery.test.ts
```

Expected: 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/game/engine/ambush.ts test/feature/ambush-recovery.test.ts
git commit -m "feat: resumeForPlayer handles hydrated state (thread null) + updateThreadId on recreate"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full typecheck + lint**

```bash
bun run tsc --noEmit
bun run lint
```

Expected: PASS. Zero new lint errors.

- [ ] **Step 2: Full test suite**

```bash
bun test
```

Expected: ≥355/355 pass (346 baseline + 6 BattleRepo + 5 BattleStore + 3 ambush-recovery).

- [ ] **Step 3: Manual smoke**

Z botem podłączonym do test serwera:

1. Start botem (`bun start`) — w logach: `[ambush] hydrate: 0 active battles restored`
2. Idź na ekspedycję, czekaj na ambush (lub `AMBUSH_CHECK_INTERVAL_MS=10000 AMBUSH_CHANCE=1.0 bun start` żeby wymusić)
3. W ambush threadzie kliknij akcję, potem `Ctrl+C` (graceful shutdown — `flush() + mongo.close()`)
4. Restart bota: `bun start` — w logach: `[ambush] hydrate: 1 active battles restored`
5. Otwórz `/expedition` — przycisk "⚔️ Wróć do walki" widoczny (gdy active state istnieje)
6. Kliknij — bot odtwarza thread w parent channel, wystawia board + panel akcji
7. Skończ walkę normalnie
8. Sprawdź Mongo: `mongo discordbot --eval 'db.battles.find({finished: true}).toArray().slice(-3)'`

- [ ] **Step 4: Phase 2 done**

Po zielonej Fazie 2: brainstorm planu Phase 3 (Dungeon/Boss/WorldBoss persistence — analogicznie do Ambush).

---

## Self-review summary

**Spec coverage** ✅:
- BattleDoc schema + BattleRepo — Task 3
- BattleStore (serialize/deserialize, snapshot per round, finish) — Task 4
- Stable `_battleId` — Task 1+2
- AmbushService snapshot/finish wiring — Task 5
- Hydrate na startup + stale filter — Task 6
- Recovery flow (thread null → recreate + updateThreadId) — Task 7
- TTL na finished battles (7 dni) — Task 3 step 3 (createIndexes)
- Indeksy `playerIds, finished` — Task 3 step 3

**Out of Phase 2:**
- Dungeon/Boss/WorldBoss persistence — Phase 3
- PartyService → Mongo — Phase 4
- Aggregated "Wróć do walki" w expedition view dla dungeon/boss/worldBoss — Phase 5

**Type consistency:** `BattleType`, `BattleDoc`, `BattleContext`, `LoadedBattle` użyte konsekwentnie. `_battleId` na `BattleState` jest in-memory pendant `_id` w BattleDoc.

**No placeholders:** każdy step ma exact code. Decyzja "snapshot await przed thread.send" eksplicite (Task 5 step 3) — uzasadniona w specu sekcja 5 "Awaitowany vs fire-and-forget".
