# Mongo Phase 3: Dungeon / Boss / WorldBoss Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozszerzyć battle persistence z Phase 2 na pozostałe walki PvE — Dungeon (party multi-room), Boss (city boss), WorldBoss (event-based) — żeby po crashu/restarcie state walki nie znikał.

**Architecture:** Pattern z Phase 2 (AmbushService) zaaplikowany do `DungeonService`, `BossService`, `WorldBossService`: konstruktor przyjmuje `BattleStore`, każde rozpoczęcie walki wywołuje `battleStore.create()` z type-specific contextem, `battleStore.snapshot()` po każdym `resolveBattleRound`, `battleStore.finish()` w każdej ścieżce zakończenia. Każdy serwis dostaje `hydrate()` na startup. Type-specific context rozszerzony: `dungeonContext` o `roomIndex/currentBossId/partyMemberIds`, `worldBossContext` o `participantIds` (zamiast nieużywanego `phase`).

**Tech Stack:** Już zainstalowane w Phase 1+2 — `mongodb` driver, `BattleStore`, `BattleRepo`.

**Spec:** [`docs/superpowers/specs/2026-05-07-mongo-migration-and-battle-persistence-design.md`](../specs/2026-05-07-mongo-migration-and-battle-persistence-design.md) (Rollout faza 3)

---

## File Structure

**Modify:**

| Path | Change |
| --- | --- |
| `src/persistence/repos/battle.repo.ts` | Rozszerz `dungeonContext` (dodaj `roomIndex`, `currentBossId`, `partyMemberIds`). Zmień `worldBossContext` (z `phase` na `participantIds: string[]`). |
| `src/modules/game/engine/battle-store.ts` | Zaktualizuj `BattleContext` żeby pasował do nowego schematu kolekcji. |
| `src/modules/game/services/dungeon.service.ts` | Konstruktor przyjmuje `BattleStore`. Po stworzeniu state — `battleStore.create()` z `dungeonContext`. Po `resolveBattleRound` — `battleStore.snapshot()`. W każdej ścieżce `states.delete` — `battleStore.finish()`. Dodaj `hydrate()`. |
| `src/modules/game/services/boss.service.ts` | Analogicznie: `BattleStore` w konstruktorze, `create/snapshot/finish/hydrate`. |
| `src/modules/game/engine/world-boss.ts` | Analogicznie: `BattleStore` w konstruktorze, `create/snapshot/finish/hydrate`. |
| `src/modules/game/index.ts` | DI: `BattleStore` przekazywany do `DungeonService`/`BossService`/`WorldBossService`. `startWorldBossLoop` async + `await wb.hydrate()`. `registerGameCommands` przekazuje BattleStore do dungeon/boss. |
| `src/index.ts` | `worldBossService = await startWorldBossLoop(...)`. |

**Create:**

| Path | Responsibility |
| --- | --- |
| `test/feature/battle-persistence-multi.test.ts` | Test recovery cyclu dla dungeon/boss/worldboss — create + snapshot + load active per typ |

---

### Task 1: Rozszerz `dungeonContext` i `worldBossContext` w BattleDoc

**Files:**
- Modify: `src/persistence/repos/battle.repo.ts:23-28` (BattleDoc)
- Modify: `src/modules/game/engine/battle-store.ts:8-15` (BattleContext)

- [ ] **Step 1: Update BattleDoc schema**

W `src/persistence/repos/battle.repo.ts` znajdź:

```typescript
  // type-specific (opcjonalne, jedno z poniższych w zależności od `type`):
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
```

Zmień na:

```typescript
  // type-specific (opcjonalne, jedno z poniższych w zależności od `type`):
  expedition?: { destination: string; channelId: string };
  dungeonContext?: {
    dungeonId: string;
    roomIndex: number;
    currentBossId: string;
    partyMemberIds: string[];
  };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; participantIds: string[] };
```

- [ ] **Step 2: Update BattleContext w battle-store.ts**

W `src/modules/game/engine/battle-store.ts` znajdź:

```typescript
export interface BattleContext {
  parentChannelId: string;
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
}
```

Zmień na:

```typescript
export interface BattleContext {
  parentChannelId: string;
  expedition?: { destination: string; channelId: string };
  dungeonContext?: {
    dungeonId: string;
    roomIndex: number;
    currentBossId: string;
    partyMemberIds: string[];
  };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; participantIds: string[] };
}
```

- [ ] **Step 3: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 361/361 zielony (no behavior change yet).

- [ ] **Step 4: Skip commit, idź do Task 2**

Bundle commit z Task 2.

---

### Task 2: DungeonService — wstrzyknij BattleStore + create/snapshot/finish/hydrate

**Files:**
- Modify: `src/modules/game/services/dungeon.service.ts`
- Modify: `src/modules/game/index.ts` (DI)

- [ ] **Step 1: Add BattleStore parameter do konstruktora**

W `src/modules/game/services/dungeon.service.ts` znajdź:

```typescript
export class DungeonService {
  private readonly states = new Map<string, DungeonBattleState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}
```

Zmień na:

```typescript
import { BattleStore } from '../engine/battle-store.js';
// ... (na liście importów)

export class DungeonService {
  private readonly states = new Map<string, DungeonBattleState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly battleStore: BattleStore,
  ) {}
```

- [ ] **Step 2: `battleStore.create()` po stworzeniu state**

Znajdź konstrukcję `state: DungeonBattleState = {...}` (~linia 305) i `this.states.set(thread.id, state);` poniżej (~linia 320). Po `this.states.set` dodaj:

```typescript
    await this.battleStore.create(state, 'dungeon', {
      parentChannelId: thread.parentId ?? thread.id,
      dungeonContext: {
        dungeonId: state.dungeonId,
        roomIndex: state.roomIndex,
        currentBossId: state.currentBossId,
        partyMemberIds: state.partyMemberIds,
      },
    });
```

(`thread.parentId` może nie być dostępne w typie `any` — fallback do `thread.id` jest ok, w produkcji `parentId` istnieje na thread channels.)

- [ ] **Step 3: `battleStore.snapshot()` po resolveBattleRound**

Znajdź `const result = resolveBattleRound(state);` (~linia 363). Pod nim dodaj:

```typescript
    await this.battleStore.snapshot(state);
```

- [ ] **Step 4: `battleStore.finish()` w obu finish ścieżkach**

Znajdź pierwszą gałąź zakończenia (loss/draw, ~linia 388 — `this.states.delete(state.id)`):

```typescript
        await closeBattleThread(...);
        this.states.delete(state.id);
        return;
```

Zmień na:

```typescript
        await this.battleStore.finish(state._battleId, {
          winnerTeam: result.winnerTeam,
          draw: result.draw,
        });
        await closeBattleThread(...);
        this.states.delete(state.id);
        return;
```

Powtórz dla drugiej gałęzi (final win, ~linia 446 — `this.states.delete(state.id)`):

```typescript
        await this.battleStore.finish(state._battleId, {
          winnerTeam: result.winnerTeam,
          draw: result.draw,
        });
        await closeBattleThread(...);
        this.states.delete(state.id);
        return;
```

Po room-clear (kontynuacja walki) — snapshot pokrywa update'y `combatants`/`roomIndex`/`currentBossId`. Po update'ach state dodaj `await this.battleStore.snapshot(state);` przed `await this.promptHumans(state);` żeby `roomIndex/currentBossId` po zaliczonym pokoju trafiły do bazy:

Znajdź miejsce po `state.combatants.push(nextBoss); state.currentBossId = ...;` (~linia 452-454). Po tych liniach dodaj:

```typescript
      await this.battleStore.snapshot(state);
```

- [ ] **Step 5: Dodaj `hydrate()` do DungeonService**

W klasie `DungeonService` dodaj nowy publiczny method (np. po konstruktorze):

```typescript
  /** Wczytuje aktywne dungeony z Mongo na starcie. Thread null — czeka na resume. */
  async hydrate(): Promise<void> {
    const loaded = await this.battleStore.loadActive();
    let restored = 0;
    for (const { state, doc } of loaded) {
      if (doc.type !== 'dungeon' || !doc.dungeonContext) continue;
      const dungeonState = state as DungeonBattleState;
      dungeonState.dungeonId = doc.dungeonContext.dungeonId;
      dungeonState.roomIndex = doc.dungeonContext.roomIndex;
      dungeonState.currentBossId = doc.dungeonContext.currentBossId;
      dungeonState.partyMemberIds = doc.dungeonContext.partyMemberIds;
      this.states.set(state.id, dungeonState);
      restored += 1;
    }
    console.log(`[dungeon] hydrate: ${restored} active dungeons restored`);
  }
```

- [ ] **Step 6: Wire BattleStore w `src/modules/game/index.ts`**

Znajdź `const dungeons = new DungeonService(stats, party);` (~linia 78). Zmień na:

```typescript
const battleStore = new BattleStore(services.repos.battle);
const dungeons = new DungeonService(stats, party, battleStore);
```

(Najpierw upewnij się, że `BattleStore` jest zaimportowany — powinien być z Phase 2.)

`registerGameCommands` może już dostawać `services.repos`. Sprawdź czy `services` przekazane jest. Jeśli `registerGameCommands` ma sygnaturę `(manager, services)` to OK.

Po wywołaniu konstruktora dodaj `await dungeons.hydrate();` w `registerGameCommands` jeśli ona nie jest async — jeśli tak, zmień na async.

Alternatywa (mniej inwazyjnie): hydrate'uj w `createGameServices` zwracane services i przesuń DungeonService tworzenie tam. Ale to większa zmiana — zostań przy obecnej strukturze i zmień `registerGameCommands` na async.

W `src/index.ts`:

```typescript
await registerGameCommands(manager, gameServices);
```

- [ ] **Step 7: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 361/361 zielony (no new tests yet, no behavior break).

- [ ] **Step 8: Skip commit, bundle z Task 3+4**

---

### Task 3: BossService — wstrzyknij BattleStore + create/snapshot/finish/hydrate

**Files:**
- Modify: `src/modules/game/services/boss.service.ts`
- Modify: `src/modules/game/index.ts` (DI)

- [ ] **Step 1: Add BattleStore param + import**

W `src/modules/game/services/boss.service.ts` w klasie `BossService`:

```typescript
import { BattleStore } from '../engine/battle-store.js';
// ... (lista imports)

export class BossService {
  private readonly states = new Map<string, BossBattleState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly battleStore: BattleStore,
    private readonly quests?: QuestService,
  ) {}
```

(Zmieniam kolejność param — `battleStore` przed `quests`; alternatywnie po `quests` dla minimalnej zmiany call-site'u. Wybierz wg istniejącego stylu — sprawdź call site w `src/modules/game/index.ts:77` — `const bosses = new BossService(stats, quests);`. Najmniej inwazyjne: dodaj jako 2nd param.)

Końcowo:

```typescript
  constructor(
    private readonly stats: PlayerStatsService,
    private readonly battleStore: BattleStore,
    private readonly quests?: QuestService,
  ) {}
```

- [ ] **Step 2: `battleStore.create` po `this.states.set(thread.id, state);`**

Znajdź ~linia 298 — `this.states.set(thread.id, state);`. Po:

```typescript
    await this.battleStore.create(state, 'boss', {
      parentChannelId: thread.parentId ?? thread.id,
      bossContext: { bossId: state.bossId },
    });
```

- [ ] **Step 3: `battleStore.snapshot` po `resolveBattleRound`**

Znajdź `const result = resolveBattleRound(state);` (~linia 435). Pod tą linią dodaj:

```typescript
    await this.battleStore.snapshot(state);
```

- [ ] **Step 4: `battleStore.finish` w `finish()` method**

Znajdź metodę `finish` (~linia 457). Na początku (po deklaracji method body):

```typescript
  private async finish(
    state: BossBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    await this.battleStore.finish(state._battleId, {
      winnerTeam: result.winnerTeam,
      draw: result.draw,
    });
    const playerCombatant = state.combatants.find((c) => c.team === 0)!;
    // ... reszta zostaje
```

- [ ] **Step 5: Dodaj `hydrate()` do BossService**

```typescript
  /** Wczytuje aktywne walki z bossami na starcie. */
  async hydrate(): Promise<void> {
    const loaded = await this.battleStore.loadActive();
    let restored = 0;
    for (const { state, doc } of loaded) {
      if (doc.type !== 'boss' || !doc.bossContext) continue;
      const bossState = state as BossBattleState;
      bossState.bossId = doc.bossContext.bossId;
      this.states.set(state.id, bossState);
      restored += 1;
    }
    console.log(`[boss] hydrate: ${restored} active boss battles restored`);
  }
```

- [ ] **Step 6: Wire w `src/modules/game/index.ts`**

Znajdź `const bosses = new BossService(stats, quests);` (~linia 77). Zmień na:

```typescript
const bosses = new BossService(stats, battleStore, quests);
```

(`battleStore` już zdefiniowane w Task 2 step 6.)

Dodaj `await bosses.hydrate();` w odpowiednim miejscu w `registerGameCommands`.

- [ ] **Step 7: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 361/361 zielony.

- [ ] **Step 8: Skip commit, bundle z Task 4**

---

### Task 4: WorldBossService — wstrzyknij BattleStore + create/snapshot/finish/hydrate

**Files:**
- Modify: `src/modules/game/engine/world-boss.ts`
- Modify: `src/modules/game/index.ts` (DI)
- Modify: `src/index.ts` (await startWorldBossLoop)

- [ ] **Step 1: Add BattleStore param + import**

W `src/modules/game/engine/world-boss.ts`:

```typescript
import { BattleStore } from './battle-store.js';
// ...

export class WorldBossService {
  // ... fields ...

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
    private readonly battleStore: BattleStore,
  ) {}
```

(Sprawdź dokładny obecny constructor — jeśli ma więcej params, dodaj `battleStore` jako ostatni.)

- [ ] **Step 2: `battleStore.create` po `this.battles.set(tid, state);`**

Znajdź ~linia 293 — `this.battles.set(tid, state);`. Po niej:

```typescript
    await this.battleStore.create(state, 'worldBoss', {
      parentChannelId: thread.parentId ?? thread.id,
      worldBossContext: { bossId: state.bossId, participantIds: state.participantIds },
    });
```

- [ ] **Step 3: `battleStore.snapshot` po `resolveBattleRound`**

Znajdź `const result = resolveBattleRound(state);` (~linia 393). Pod tą linią:

```typescript
    await this.battleStore.snapshot(state);
```

- [ ] **Step 4: `battleStore.finish` w finish path**

Znajdź gdzie state zostaje usunięty z `this.battles` (`this.battles.delete(...)`). Przed delete:

```typescript
    await this.battleStore.finish(state._battleId, {
      winnerTeam: result.winnerTeam,
      draw: result.draw,
    });
```

(Może być więcej niż jedna ścieżka delete — w każdej dodaj.)

- [ ] **Step 5: Dodaj `hydrate()` do WorldBossService**

```typescript
  /** Wczytuje aktywne world-boss battles z Mongo. */
  async hydrate(): Promise<void> {
    const loaded = await this.battleStore.loadActive();
    let restored = 0;
    for (const { state, doc } of loaded) {
      if (doc.type !== 'worldBoss' || !doc.worldBossContext) continue;
      const wbState = state as WorldBossBattleState;
      wbState.bossId = doc.worldBossContext.bossId;
      wbState.participantIds = doc.worldBossContext.participantIds;
      this.battles.set(state.id, wbState);
      restored += 1;
    }
    console.log(`[world-boss] hydrate: ${restored} active battles restored`);
  }
```

- [ ] **Step 6: Wire w `src/modules/game/index.ts`**

Znajdź `startWorldBossLoop`:

```typescript
export function startWorldBossLoop(client: Client, services: GameServices): WorldBossService {
  const wb = new WorldBossService(client, services.stats);
  wb.start();
  return wb;
}
```

Zmień na:

```typescript
export async function startWorldBossLoop(
  client: Client,
  services: GameServices,
): Promise<WorldBossService> {
  const battleStore = new BattleStore(services.repos.battle);
  const wb = new WorldBossService(client, services.stats, battleStore);
  await wb.hydrate();
  wb.start();
  return wb;
}
```

W `src/index.ts`:

```typescript
worldBossService = await startWorldBossLoop(client, gameServices);
```

- [ ] **Step 7: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 361/361 zielony.

- [ ] **Step 8: Commit (bundle Tasks 1-4)**

```bash
git add src/persistence/repos/battle.repo.ts src/modules/game/engine/battle-store.ts src/modules/game/services/dungeon.service.ts src/modules/game/services/boss.service.ts src/modules/game/engine/world-boss.ts src/modules/game/index.ts src/index.ts
git commit -m "feat: wire BattleStore into Dungeon/Boss/WorldBoss services"
```

---

### Task 5: Test recovery dla wszystkich 3 typów

**Files:**
- Create: `test/feature/battle-persistence-multi.test.ts`

- [ ] **Step 1: Write tests dla każdego typu**

```typescript
// test/feature/battle-persistence-multi.test.ts
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
        dungeonId: 'd', roomIndex: 0, currentBossId: 'm1', partyMemberIds: ['p1'],
      },
    });
    const b = makeState([mkCombatant('p1', 0), mkCombatant('boss', 1)]);
    await store.create(b, 'boss', {
      parentChannelId: 'chan-1',
      bossContext: { bossId: 'x' },
    });

    expect((await store.loadActive())).toHaveLength(2);
    await store.finish(a._battleId, { winnerTeam: 0 });
    expect((await store.loadActive())).toHaveLength(1);
    await store.finish(b._battleId, { draw: true });
    expect((await store.loadActive())).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bun test test/feature/battle-persistence-multi.test.ts
```

Expected: PASS — 4 tests green.

- [ ] **Step 3: Commit**

```bash
git add test/feature/battle-persistence-multi.test.ts
git commit -m "test: persistence + recovery for dungeon/boss/worldboss"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full typecheck + lint**

```bash
bun run tsc --noEmit
bun run lint
```

Expected: PASS.

- [ ] **Step 2: Full test suite**

```bash
bun test
```

Expected: 365/365 pass (361 + 4 new).

- [ ] **Step 3: Phase 3 done**

Po zielonej Fazie 3: kolejny plan Phase 4 (`PartyService` → Mongo) — najmniejszy z pozostałych. Po Fazie 4: Phase 5 (aggregated "Wróć do walki" UI).

---

## Self-review summary

**Spec coverage** ✅:
- Dungeon battle persistence + recovery — Tasks 1+2
- Boss battle persistence + recovery — Tasks 1+3
- WorldBoss battle persistence + recovery — Tasks 1+4
- Hydrate na startup dla każdego typu — w każdym Task

**Out of Phase 3:**
- PartyService → Mongo — Phase 4
- Aggregated "Wróć do walki" UI dla dungeon/boss/worldboss — Phase 5

**Type consistency:** `BattleStore.create` API spójne. `_battleId` jak w Phase 2. `BattleType` enum: 'dungeon'/'boss'/'worldBoss' jak w spec. `dungeonContext` rozszerzony o `roomIndex`/`currentBossId`/`partyMemberIds` — drobna zmiana wobec spec'u (`floor` → `roomIndex`), uzasadniona naszym data model.

**No placeholders:** każdy step ma exact code i exact line references.
