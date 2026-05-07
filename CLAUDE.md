# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime + commands

Bun is the primary runtime — `bun start`, `bun --watch src/index.ts` (dev), `bun test`. Node fallback uses compiled `dist/`.

```bash
bun test                                      # all tests
bun test -t "openInventoryForUser"            # single test by name
bun test test/feature/inventory-thread.test.ts # single file
bun run tsc --noEmit                          # typecheck (no emit)
bun run lint                                  # eslint
```

`tsc --noEmit` is the canonical pre-commit gate; `tsc` (no flag) emits to `dist/` and is run by `npm run build`.

## Architecture: command dispatch flow

Two parallel command paths share the same handlers:

1. **Text command (`.foo bar`)** → `client.on('messageCreate')` → `CommandManager.dispatch` → finds command via `cmd.matches(content)` → calls `cmd.execute({ msg, prompt, registerThread, … })`.
2. **Slash command (`/foo`)** → `client.on('interactionCreate')` → `CommandManager.dispatchSlash` → `cmd.executeSlash(interaction)`.
3. **Buttons** → `interaction.isButton()` → `manager.handleInteraction` iterates **all** registered commands' `handleInteraction` (each early-returns if its `customId` prefix doesn't match), then `src/index.ts` runs ambush/worldBoss/arena/identification/enchanter handlers in sequence.

**Thread-routed messages**: when a service creates a private thread (shop / inventory / etc.) it calls `ctx.registerThread(thread)`. Subsequent messages in that thread bypass prefix matching — `manager.dispatch` looks up `threadInfo.get(channel.id)` and routes the message to that registered command's `execute` with the **full message content** as `prompt` (NOT `extractPrompt(content)` — that would slice off the first N chars equal to the command's prefix length, mangling unrelated text like `sell 6 7` → `6 7`).

This is how `.inv` opens a thread, then text in the thread (`sell 1 2 3`, `equip 4`, `close`) routes back to `InventoryService.handleThreadCommand` without prefixes.

**Slash-path registration gotcha**: `executeSlash` does NOT receive `ctx.registerThread`. Commands that open threads from slash (e.g. `InventoryCommand`) must accept a `registerThreadFn` constructor parameter and the wiring in `registerGameCommands` (`src/modules/game/index.ts`) must pass `(thread) => manager.registerThreadFor(thread, inventoryCommand)`. Without this, the freshly-created thread is unregistered → orphan detection in `manager.dispatch` deletes it on the first user message (see below).

**Orphan thread detection**: `manager.dispatch` checks if a message arrives in a thread whose name starts with `Plecak:` / `Sklep:` / `Smith:` but is NOT in `threadInfo`. This happens after a bot restart (in-memory `threadInfo` wiped) or if registration was missed. The handler replies "osierocony" + deletes the thread. If you add new thread-creating services, either add their thread-name prefix here OR ensure registration is always wired.

## Architecture: services own state, commands are thin

`src/modules/game/commands/*.command.ts` only parse args and delegate. All state + logic lives in `src/modules/game/services/*.service.ts`. When extending behavior, change the service. The `MenuService` is wired by DI in `registerGameCommands` (`src/modules/game/index.ts`) — it receives every other service via constructor.

## Architecture: inventory UX (text commands in private thread)

Inventory is a **single editable listing message** in a private thread + bare text commands (no `.inv` prefix needed in the thread): `sell N M K` (batch), `equip N`, `unequip weapon|armor|tool`, `close`. After each action `InventoryService.refreshListing` edits the same message. This costs ~50× fewer Discord API calls than the older per-item-message + button design. Equipped items can't be sold (skipped with a warning).

Re-opening (`/inv` or `.inv`) when state already exists: silently clears the in-memory state and opens a fresh thread. The old Discord thread is left to auto-archive (don't `delete()` — Discord throws if it's already gone).

## Architecture: effective stats SoT

`PlayerStatsService.effective*()` is the single source of truth for combat-relevant numbers (HP/dmg/def/crit/speed/spellPower/primary). Every UI render, `.stats` display, and `buildPlayerCombatant` (combat snapshot) reads from these — never recompute inline. Changes to gear/gem-effect math go in `effective*` methods or `gem-effects.ts` resolvers, not in renderers.

Example: armor red gem adds HP. The bonus lives in `armorGemHpBonus(p)` which `effectiveMaxHp(p)` includes. UI just calls `effectiveMaxHp` and gets the right number.

## Architecture: combat round is multi-API-call

`combat-battle.ts:resolveBattleRound` resolves all combatants' actions in 5 phases (defend / heal-skill / item / attack / end-of-round buffs). The hot path is the *messages around* it — disable old panel + send round summary + post new prompt panel = 3-4 sequential Discord API calls per round per human. **Per-channel rate limit is 5 msgs / 5s** — heavy combat threads throttle within seconds.

When changing combat flow, prefer fewer messages: combine round summary into the new panel via one `interaction.update`, skip "disable buttons" edits when the panel is going to be replaced anyway.

## Persistence: MongoDB (collections `players`, `items`)

Stan trzymany w MongoDB self-hosted (env: `MONGO_URI`, fail-fast jeśli brak). `PlayerStatsService` to in-RAM SoT — `byId: Map<string, PlayerStats>` + `itemsByUid: Map<string, ItemInstance>` + `itemsByUser: Map<string, Set<uid>>`. Read: tylko z RAM (po `await stats.load()` na starcie). Write: `save()` zostaje sync z perspektywy callera, ale **fire-and-forget async upsert** do Mongo z dirty-trackingiem (porównanie `JSON.stringify` per player + per item). `flush()` w SIGTERM/SIGINT czeka na pending writes przed `mongo.close()`.

Items są w **osobnej kolekcji** z `userId` jako foreign reference (indeks `{ userId: 1 }`). `PlayerStats.inventory` ma tylko `resources: Record<string, number>` — pole `items` znika z dokumentu gracza. Dostęp przez API serwisu:
- `playerStats.addItem(p, item)` / `removeItem(p, uid)` / `findItem(p, uid)`
- `playerStats.getItemsForPlayer(userId): ItemInstance[]` — całe inventory gracza
- `playerStats.equippedItem(p, slot)` — założony item (`equipped` to nadal mapa slotów → uidy)

**NIE używaj `player.inventory.items`** — pole nie istnieje. Wszystkie zewnętrzne miejsca które filtrują po itemach idą przez `getItemsForPlayer(p.id).filter(...)`. Funkcje pomocnicze (np. `socketableItems`, `upgradeableItems`) przyjmują `stats: PlayerStatsService` jako drugi argument.

Migracja legacy: `migrateLegacyJsonIfNeeded(repos)` na starcie (z `src/persistence/migrate-legacy.ts`) czyta `data/players.json` LUB `data/players/*.json`, splituje na `players` collection (bez `inventory.items`) + `items` collection (z `userId`), rename'uje stary plik/folder na `*.migrated-<ts>` jako safety net (NIE usuwa). Idempotent (gate `await repos.player.count() > 0`). Walidacja unique uidy między graczami przed insertem — duplicate = throw fail-fast.

Testy: `mongodb-memory-server` per-test (helper `mongoPlayerStats()` w `test/helpers/factories.ts`), izolacja przez unikalne `dbName` (UUID). Każdy test setup'uje świeży harness w `beforeEach` async + cleanup w `afterEach`.

## Diagnostics: lag logging

`src/index.ts` and `command.manager.ts` log slow interactions when `LAG_LOG !== '0'` (default on). Threshold via `LAG_LOG_THRESHOLD_MS` (default 200). Output:

```
[lag] btn "bbr:nav:..." total=2959ms (ws 110ms) manager=2959ms
[lag-mgr] btn "bbr:nav:..." cmds: boss=2890ms inventory=42ms
```

`ws` = Discord gateway ping. If `ws > 200`, problem is Discord/network. If `manager` ≈ total but ws is fine, find which command in `[lag-mgr]` breakdown is heavy. Common cause: bot-side sync I/O blocking the event loop (Node is single-threaded, all interactions queue while one save/write blocks).

## Conventions

- **No `as` casts** — use type guards, generics, or `unknown`-narrowing. The codebase has helpers like `hasSendable`, `isInventoryThread` for this.
- **No `Co-Authored-By` trailers** in commits.
- **Conventional commit prefixes**: `feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`.
- **Discord ephemeral**: use `flags: MessageFlags.Ephemeral`, never `ephemeral: true` (deprecated, also logs a stack trace per call which adds latency).
- **Keep files short and concerns isolated** — when a service grows past ~500 LOC consider splitting (see `engine/battle-helpers.ts` extracted from per-service combat code).

## Tests

`jest.config.ts` uses ts-jest with `tsconfig.test.json`. Tests in `test/unit/` (focused) and `test/feature/` (integration with real PlayerStatsService + fake Discord interactions).

Test patterns:
- `tmpPlayerFile()` from `test/helpers/factories.ts` returns unique tmp paths per test → isolated `data/players/` subdir per test
- Fake interactions (`makeBtn`, `makeMsg`) provide minimal mocks for `interaction.update`/`reply`/`followUp`
- `mockRandom([0.1, 0.5, …])` from factories controls `Math.random` calls in order

## Persisted preferences (memory)

Some conventions are stored in user-level memory (Polish-language project): use Bun by default, prefer English code identifiers but Polish player-facing strings, max-2-sentence responses by default. See `~/.claude/projects/.../memory/MEMORY.md` index if present.
