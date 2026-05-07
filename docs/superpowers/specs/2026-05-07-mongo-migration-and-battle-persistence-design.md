# Mongo migration + battle persistence — design

**Date:** 2026-05-07
**Status:** Draft (awaiting user review)
**Author:** brainstorming session

## Problem

Bot trzyma stan trwający (gracze, party, walki) w mieszance per-player JSON i in-memory `Map`. Po crashu / restarcie / zniknięciu Discord threadu trwająca walka ekspedycyjna (ambush, forced final fight) jest tracona, mimo że thread mógłby być odtworzony. `AmbushService.resumeForPlayer` umie odtworzyć thread, ale tylko gdy `BattleState` żyje w pamięci.

## Cel

1. Przenieść persistencję bazową z plików JSON na MongoDB (self-hosted, ten sam Linux co bot).
2. Persistować stany aktywnych walk PvE (ambush, dungeon, boss, finalFight, worldBoss) tak, żeby po crashu/restarcie / zniknięciu threadu gracz mógł kliknąć "**⚔️ Wróć do walki**" na widoku ekspedycji i wznowić walkę w nowym threadzie z zachowanym stanem (HP, buffy, cooldowny, runda).
3. Znormalizować przedmioty do osobnej kolekcji z referencją po `userId`.

Out of scope: cooldowny skilli, browser/UI state, multi-instance bota, replikacja Mongo. Duel + Arena nie są persistowane (sesyjne, krótkie).

## Architektura

### Warstwa persistencji

```
src/persistence/
  mongo.ts                  // singleton MongoClient + Db, fail-fast connect
  repos/
    player.repo.ts
    item.repo.ts
    party.repo.ts
    battle.repo.ts
src/modules/game/engine/
  battle-store.ts           // serialize/deserialize BattleState ↔ BattleDoc
test/helpers/
  mongo-setup.ts            // mongodb-memory-server harness, mongoTestEnv()
```

**Driver:** native `mongodb` (nie Mongoose) — własne `Collection<T>` typings, zero `as`-rzutów, zgodnie z konwencją repo.

**Connection lifecycle:**

* `MONGO_URI` z `.env` (np. `mongodb://127.0.0.1:27017/discordbot`). Brak → bot fail-fast.
* `src/index.ts` na starcie: `await mongo.connect()` → `await migrateLegacyJsonIfNeeded()` → reszta startup.
* `SIGINT/SIGTERM` handler woła `playerStats.flush()` (pending writes) + `client.close()`.

### Kolekcje

| Kolekcja | `_id` | Zawiera |
| --- | --- | --- |
| `players` | userId | wszystko z `PlayerStats` MINUS `inventory.items` |
| `items` | `ItemInstance.uid` | `ItemInstance` + `userId` jako foreign reference |
| `parties` | partyId | `{ leaderId, members[], createdAt }` |
| `battles` | UUID (NIE thread.id) | serializowany `BattleState` + metadata |

**Indeksy** (tworzone idempotentnie przy starcie przez każdy repo):

* `players`: `_id` (default)
* `items`: `{ userId: 1 }` — szybki inventory lookup
* `parties`: `{ members: 1 }` — lookup party po graczu
* `battles`: `{ playerIds: 1, finished: 1 }` partial dla `finished:false` — szybki "active battle for player"; TTL na `updatedAt` 7 dni dla `finished:true` (auto-purge historii).

### Schemat `players`

`PlayerStats` zostaje as-is, ale `inventory.items` znika. Po refaktorze:

```ts
interface Inventory {
  resources: Record<string, number>;   // złoto, iron, wood, etc.
}
```

`equipped: { weapon?, armor?, tool? }` zostaje — to już referencje (uid strings), nie embedded items.

### Schemat `items`

```ts
type ItemDoc = ItemInstance & { _id: string; userId: string };
// _id === ItemInstance.uid (już stabilny w obecnym kodzie)
```

`ItemInstance` (w `services/items.ts`) ma `uid`, `baseId`, `rarity`, `stats`, `slot?`, `toolKind?`, `upgrades?`, `primary?`, `identified?`, gem sockets etc. — wszystko zostaje, dochodzi tylko `userId` jako foreign ref + `_id`.

### Schemat `battles`

```ts
type BattleType = 'ambush' | 'dungeon' | 'boss' | 'finalFight' | 'worldBoss';

interface BattleDoc {
  _id: string;                    // UUID, stabilny across thread recreations
  type: BattleType;
  threadId: string | null;        // current Discord thread; null = pending recreate
  parentChannelId: string;        // do recreate threadu
  combatants: BattleCombatant[];  // POJO already
  pending: Record<string, BattleAction>;  // Map → object
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
  playerIds: string[];            // team===0 ids — index column
  // type-specific (jeden z poniższych w zależności od type):
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
  // metadata
  createdAt: number;
  updatedAt: number;
}
```

**Co NIE jest persistowane** (intencjonalnie):

* `BattleState.thread` (live Discord obiekt) — zastąpione `threadId`, fetch przy resume.
* `promptMessageIds: Map<string, string>` — stale po recovery; nowe panele wystawiamy od zera.
* `AmbushBattleState.timeoutHandle` — recreated po startup z `AMBUSH_TIMEOUT_MS - (now - createdAt)`.

### Stabilna tożsamość walki

Dziś `BattleState.id === thread.id`. Po refaktorze: nowe pole `_battleId` (UUID) jest primary key w `battles` i w service Map (`AmbushService.states`, etc.). `state.id` (= thread.id) służy tylko do routingu Discord interactions. Po thread recreate `state.id` zmienia się, `_battleId` zostaje.

`battle-helpers.ts:routeBattleInteraction` musi szukać po `interaction.channel.id` (= thread.id) → potrzebny wtórny in-memory index `threadId → battleId` w każdym serwisie. Implementacja: `Map<threadId, battleId>` synchronizowany z głównym `Map<battleId, state>`.

## Komponenty

### `PlayerStatsService` (refaktor)

* Konstruktor: `(repo: PlayerRepo, items: ItemRepo)` zamiast `legacyFile: string`.
* `load(): Promise<void>` — `repo.findAll()` + `items.find({ userId: { $in: ids } }).toArray()` (jeden batch). Hyduje `byId` i `itemsByUid` Mapy.
* `save(): void` — sync z perspektywy callera, fire-and-forget async write:
  * Dirty-tracking dla graczy: porównuje `JSON.stringify(player)` z `lastSavedJson.get(id)`, async upsert tylko jeśli różne.
  * Dirty-tracking dla itemów: `lastSavedJsonItem.get(uid)` osobny, async upsert tylko jeśli różne. Item delete (sprzedaż) → `items.deleteOne` async + cleanup cache.
  * `pendingWrites: Promise<unknown>[]` agreguje promise'y; `flush()` czeka na wszystkie (używane w `SIGTERM`).
* `migrateLegacy()` — usunięte (zastąpione przez `migrateLegacyJsonIfNeeded` w startup).

### `BattleStore`

```ts
class BattleStore {
  constructor(private repo: BattleRepo) {}
  async create(state: BattleState, type: BattleType, ctx: TypeSpecificCtx): Promise<string>;
  async snapshot(state: BattleState): Promise<void>;       // upsert po każdej rundzie
  async finish(battleId: string, result: { winnerTeam?; draw? }): Promise<void>;
  async loadActive(): Promise<BattleDoc[]>;                // startup: finished:false
  async updateThreadId(battleId: string, threadId: string | null): Promise<void>;
}
```

`snapshot()` serializuje `BattleState` → `BattleDoc` (Map → Record, wycina `thread` i `timeoutHandle`). `loadActive` deserializuje odwrotnie (`thread: null`, `pending` jako Map z entries).

### Service hooki

`combat-battle.ts:resolveBattleRound` zostaje **pure** (bez zależności od Mongo). Każdy serwis (Ambush/Dungeon/Boss/WorldBoss) wokół wywołania `resolveBattleRound`:

```ts
const result = resolveBattleRound(state);
await battleStore.snapshot(state);                      // każda runda
if (result.finished) await battleStore.finish(state._battleId, result);
```

**Granularność:** snapshot **po zakończonej rundzie** (decyzja brainstormingu — wariant A). Akcje pre-round (`pending`) NIE są persistowane między round-resolutions; po recovery gracz musi kliknąć ponownie. Akceptowalne — przyciski wystawiają się od nowa.

**Awaitowany vs fire-and-forget:** `battleStore.snapshot` jest **awaitowany** (w przeciwieństwie do `playerStats.save` które jest fire-and-forget). Powód: round resolution już jest na async path (3-4 Discord API calls per round), więc `await mongo` o sub-ms koszcie nie zmienia opóźnienia. Awaitowanie daje gwarancję że snapshot jest na dysku **przed** wysłaniem round-summary message — eliminuje okno "summary widoczny userowi, ale crash przed snapshot ⇒ na restarcie state cofa się o 1 rundę i user widzi to co już wcześniej widział". `playerStats.save` z kolei jest na hot path każdej akcji gracza (button click) i awaitowanie blokowałoby event loop — tam fire-and-forget jest świadomym wyborem.

### Recovery flow

**Startup (rebuild):**

```
client.once('ready'):
  docs = await battleStore.loadActive()
  for doc in docs:
    state = deserialize(doc)            // thread=null
    switch doc.type:
      ambush/finalFight → ambushService.states.set(doc._id, state)
      dungeon → dungeonService.states.set(doc._id, state)
      boss → bossService.states.set(doc._id, state)
      worldBoss → worldBoss.states.set(doc._id, state)
    if doc.type=='ambush':
      schedule timeoutHandle = AMBUSH_TIMEOUT_MS - (now - doc.createdAt)
```

Bot **nie** odtwarza threadów ani nie pinguje channeli na starcie — czeka na klik gracza.

**Klik "Wróć do walki"** (rozszerza istniejące `AmbushService.resumeForPlayer`, generalizowane na inne serwisy):

```
1. find state w pamięci po playerId (loaded z Mongo lub stworzony in-session)
2. jeśli state.thread !== null && thread fetchowalny:
     thread.setArchived(false) → thread.send(board)
     succeed → promptHumans → return ok
3. fallback (state.thread null lub send rzucił):
     newThread = recreateThreadFor(state)              // istniejąca metoda
     state.thread = newThread; state.id = newThread.id
     services.states.delete(oldId); services.states.set(newThread.id, state)  // re-key Map
     await battleStore.updateThreadId(state._battleId, newThread.id)
     promptHumans → return ok
4. parent channel też zniknął:
     "Walka utracona — channel zniknął" do gracza
     await battleStore.finish(state._battleId, { draw: true })
     services.states.delete(oldId)
```

**Edge case party:** każdy z 3 graczy klika "Wróć do walki" → pierwszy klik recreate'uje thread + prompt-uje siebie; kolejne kliki widzą istniejący thread → tylko `promptHumans` dla klikającego (re-prompt). To już zachowanie obecnego `resumeForPlayer`.

**Stale battles na starcie:** `loadActive` filtruje `now - createdAt > 24h && type==='ambush'` → finish'uje jako timeout, pomija.

### `/expedition` widok aktywnej wyprawy

`ExpeditionService.renderActiveContent` + `buildExpActiveRows` już mają gałąź "**⚔️ Wróć do walki**" gdy `ambushService.getActiveStateForPlayer(playerId)` zwraca state. Po zhydrowaniu service Map z Mongo button **automatycznie** pojawia się dla zapisanych walk po restarcie.

Rozszerzenie: agreguj też `dungeonService.getActiveStateForPlayer(id)` + `bossService.getActiveStateForPlayer(id)` + `worldBoss.getActiveStateForPlayer(id)`. Każdy serwis dostaje analogiczną metodę. `ExpeditionService` agreguje pierwszy znaleziony.

### `PartyService` (migracja)

Dziś `Map<string, Party>` w pamięci. Refaktor:

* `loadAll()` na starcie z `parties` collection
* Każdy `create/disband/addMember/removeMember` → `repo.upsert/deleteOne` async (fire-and-forget, dołączone do `pendingWrites`)
* Brak legacy JSON do migracji

## Migracja legacy → Mongo

**One-shot cutover na pierwszym starcie z Mongo** (`migrateLegacyJsonIfNeeded`):

```ts
async function migrateLegacyJsonIfNeeded(repos: Repos): Promise<void> {
  if (await repos.player.count() > 0) return;       // już zmigrowane
  // 1. monolith data/players.json (najstarsza wersja)
  if (fs.existsSync('data/players.json')) {
    const arr = JSON.parse(fs.readFileSync('data/players.json', 'utf8'));
    await migratePlayerArray(repos, arr);
    fs.renameSync('data/players.json', `data/players.json.migrated-${Date.now()}`);
    return;
  }
  // 2. per-player files data/players/*.json
  if (!fs.existsSync('data/players')) return;
  const files = fs.readdirSync('data/players').filter(f => f.endsWith('.json'));
  if (files.length === 0) return;
  const players = files.map(f => JSON.parse(fs.readFileSync(path.join('data/players', f), 'utf8')));
  await migratePlayerArray(repos, players);
  fs.renameSync('data/players', `data/players.migrated-${Date.now()}`);
}

async function migratePlayerArray(repos: Repos, players: PlayerStats[]): Promise<void> {
  // splituj na players (bez items) + items (z userId)
  const playerDocs = players.map(p => {
    const { inventory, ...rest } = p;
    return { ...rest, _id: p.id, inventory: { resources: inventory.resources } };
  });
  const itemDocs = players.flatMap(p =>
    p.inventory.items.map(item => ({ ...item, _id: item.uid, userId: p.id })),
  );
  // walidacja: duplicate uidy między graczami → fail-fast
  const uids = itemDocs.map(d => d._id);
  if (new Set(uids).size !== uids.length) {
    const dupes = uids.filter((u, i) => uids.indexOf(u) !== i);
    throw new Error(`[mongo] duplicate item uids in legacy data, fix manually: ${dupes.slice(0, 10).join(', ')}`);
  }
  await repos.player.insertMany(playerDocs);
  if (itemDocs.length > 0) await repos.item.insertMany(itemDocs);
  console.log(`[mongo] migrated ${playerDocs.length} players, ${itemDocs.length} items`);
}
```

Rename folderu/pliku zostaje jako safety net (NIE deleteAll). Manualny rollback = restore z renamed + drop kolekcji.

**Partial migration recovery:** jeśli `insertMany` rzuci w środku (np. duplicate key, disk full), `count() > 0` na kolejnym starcie zwróci `>0` i bot pominie migrację z częściowo zaimportowanymi danymi. Mitygacja: migrator owrappowany w try/catch — przy błędzie loguje + `process.exit(1)` zanim zdąży zrobić rename. Operator po fix (np. drop kolekcji) restartuje, migracja idzie od nowa.

`PlayerStatsService.migrateLegacy` (obecny migrator monolith→per-file) usuwany — Mongo migration jest jego następcą.

## Error handling

| Scenariusz | Zachowanie |
| --- | --- |
| Mongo down @ startup | `process.exit(1)` z czytelnym logiem (fail-fast) |
| Mongo down @ runtime (write fail) | log `[mongo] write fail`, bot dalej działa z RAM. Player zalogowany przed disconnect — bez utraty. Nowi gracze podczas outage'u — ryzyko utraty na restarcie |
| Battle snapshot fail | log + idempotent retry przy następnej rundzie. Pojedyncza runda lost OK |
| Recovery: thread gone, parent OK | `recreateThreadFor` → kontynuacja w nowym threadzie |
| Recovery: thread gone + parent gone | Komunikat do gracza + `battleStore.finish({ draw: true })` + cleanup state |
| Stale battle (>24h) na starcie | Filtrowane przez `loadActive`, finish-owane jako timeout |

## Testy

`mongodb-memory-server` + ts-jest:

```ts
// test/helpers/mongo-setup.ts
let mongod: MongoMemoryServer;
let client: MongoClient;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
});
afterAll(async () => { await client.close(); await mongod.stop(); });

export async function mongoTestEnv(): Promise<TestEnv> {
  const dbName = `test-${randomUUID()}`;
  const db = client.db(dbName);
  const repos = makeRepos(db);
  await ensureIndexes(repos);
  return { db, repos, cleanup: () => db.dropDatabase() };
}
```

**Refaktor istniejących testów:**

* `test/helpers/factories.ts:tmpPlayerFile()` zastąpiony `mongoTestEnv()`. Zwraca `{ stats: PlayerStatsService, items, cleanup }`.
* ~10 plików `test/feature/` używa `tmpPlayerFile` — zmiana to: linijka konstrukcji + `await` na setup. Logika testów bez zmian.
* `mockRandom` i `makeBtn`/`makeMsg` bez zmian.

**Nowe testy** (per faza, patrz Rollout):

* `test/feature/mongo-migration.test.ts` — migracja legacy JSON → Mongo (oba warianty: monolith i per-file).
* `test/feature/battle-persistence.test.ts` — snapshot po rundzie, deserialize, recovery.
* `test/feature/recovery-thread-gone.test.ts` — kill state pamięci → reload z DB → klik "Wróć do walki" → nowy thread odtworzony.

## Rollout (5 faz, każda mergeable)

| Faza | Co | Test gating |
| --- | --- | --- |
| 1 | Mongo infra (`persistence/`, env, connection lifecycle) + PlayerStatsService → Mongo + items collection + migracja legacy + refaktor testów | Wszystkie istniejące testy zielone, bot startuje, manual smoke: `.stats`, `.inv`, equip, sell |
| 2 | `BattleStore` + `AmbushService` snapshot/load/recovery (rozszerzenie `resumeForPlayer`) + stable `_battleId` w obrębie ambushu | Nowe testy battle-persistence + recovery-thread-gone (ambush only) |
| 3 | Dungeon/Boss/WorldBoss persistence (analogicznie do ambushu) | Per-typ recovery testy |
| 4 | `PartyService` → Mongo (parties collection) | Test party persistence cross-restart |
| 5 | `/expedition` agregowany "Wróć do walki" button (dungeon/boss/worldBoss też wystawiane) | UI smoke |

Każda faza zostawia bota w pełni działającego. Faza 1 jest największa (~10 plików testów do refaktoru), kolejne mniejsze.

## Decyzje świadome (wybory z brainstormingu)

* **Pełna migracja na Mongo** (nie tylko walki) — żeby mieć jednorodny storage.
* **Self-hosted Mongo na tym samym Linuxie** — sub-millisecond latency, agresywne writes per-runda OK.
* **Native `mongodb` driver** — lekki, czyste typings, zgodne z konwencją "no `as` casts".
* **Snapshot per-runda** (nie per-action) — minimalna inwazja w `combat-battle.ts`.
* **Recovery manualne (klik)** — nie auto-resume na starcie (unika spamu po każdym restarcie).
* **One-shot cutover** legacy JSON → Mongo (z safety-net renamem).
* **Items w osobnej kolekcji** z `userId` ref — szybsze read/write playera (mniejszy doc), własne indexy dla items.
* **`mongodb-memory-server`** — realna Mongo behavior w testach, izolacja per-test przez unikalny db name.

## Open questions

(Brak — wszystko ustalone w brainstormingu.)
