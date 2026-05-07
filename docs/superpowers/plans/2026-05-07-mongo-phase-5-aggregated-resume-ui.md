# Mongo Phase 5: Aggregated "Wróć do walki" UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozszerzyć "⚔️ Wróć do walki" button na widoku ekspedycji żeby wystawiał się dla DOWOLNEJ aktywnej walki gracza (ambush + dungeon + boss + worldBoss). Dodaj `resumeForPlayer` do Dungeon/Boss/WorldBoss services, generalizuj thread-recreate helper.

**Architecture:** Generalizujemy `recreateThreadFor` z `AmbushService` do `battle-helpers.ts` jako parametryzowany helper. Każdy z 3 dodatkowych serwisów dostaje `getActiveStateForPlayer` + `resumeForPlayer`. `BattleState` rozszerzony o `parentChannelId` (zapisany przy `create`, hydratowany z BattleDoc). `ExpeditionService.handleResume` próbuje każdy serwis w kolejności.

**Spec:** [spec sekcja "Recovery flow / Klik 'Wróć do walki'"](../specs/2026-05-07-mongo-migration-and-battle-persistence-design.md)

---

## File Structure

**Modify:**

| Path | Change |
| --- | --- |
| `src/modules/game/engine/battle-state.ts` | Dodaj `parentChannelId?: string` do `BattleState` |
| `src/modules/game/engine/battle-helpers.ts` | Eksportuj generic `recreateBattleThread(client, state, opts)` |
| `src/modules/game/engine/ambush.ts` | Refactor `recreateThreadFor` → użyj shared helper. Set `parentChannelId` w state. Hydrate populuje z doc. |
| `src/modules/game/services/dungeon.service.ts` | Dodaj `getActiveStateForPlayer`, `resumeForPlayer`. Set `parentChannelId` + hydrate. |
| `src/modules/game/services/boss.service.ts` | jw |
| `src/modules/game/engine/world-boss.ts` | jw |
| `src/modules/game/services/expedition.service.ts` | Konstruktor przyjmuje 3 dodatkowe services. `inActiveBattle` aggregates. `handleResume` tries each. Update `inAmbush` → use aggregate. |
| `src/modules/game/index.ts` | DI: pass dungeons/bosses/worldBoss do expeditions po post-construct (analog `bindAmbushService`). |

---

### Task 1: BattleState `parentChannelId`

- [ ] **Step 1: Add field**

W `src/modules/game/engine/battle-state.ts`:

```typescript
export interface BattleState {
  _battleId: string;
  /** Parent Discord channel id — używane do recreate thread po crashu. */
  parentChannelId?: string;
  id: string;
  thread: any;
  // ... reszta
}
```

- [ ] **Step 2: Each create site sets parentChannelId**

W `ambush.ts` (2 miejsca), `dungeon.service.ts`, `boss.service.ts`, `world-boss.ts` — w konstrukcji `state` dodaj `parentChannelId: <channelId>` (wartość z lokalnego `channelId`/`thread.parentId`/`channel.id`).

- [ ] **Step 3: Each hydrate populates from doc**

W każdym `hydrate()` dodaj `state.parentChannelId = doc.parentChannelId;`.

- [ ] **Step 4: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 370/370 zielony.

- [ ] **Step 5: Skip commit, bundle z Task 2.**

---

### Task 2: Extract `recreateBattleThread` to battle-helpers

- [ ] **Step 1: Add generic helper**

W `src/modules/game/engine/battle-helpers.ts` dodaj:

```typescript
import type { Client } from 'discord.js';
import type { BattleState } from './battle-state.js';
import { errMsg } from '../../../utils.js';

interface RecreateOpts {
  /** Nazwa nowego threadu — np. `Ambush (resume): playerId`. Skracana do 100 chars. */
  threadName: string;
  /** Linia anonsu w parent channelu — np. `⚔️ <@p1> — wątek odtworzony`. */
  announceText: string;
  autoArchiveMinutes?: number;
}

interface ThreadLike {
  id: string;
}

function hasId(t: unknown): t is ThreadLike {
  return !!t && typeof t === 'object' && 'id' in t && typeof (t as { id: unknown }).id === 'string';
}

/**
 * Odtwarza Discord thread w `state.parentChannelId` po jego usunięciu.
 * Zwraca nowy thread (lub null jeśli parent channel również niedostępny).
 * Wywoływane przez serwisy w `resumeForPlayer` gdy `state.thread` null lub `send` rzuca.
 */
export async function recreateBattleThread(
  client: Client,
  state: BattleState,
  opts: RecreateOpts,
): Promise<unknown> {
  if (!state.parentChannelId) return null;
  try {
    const channel = await client.channels.fetch(state.parentChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return null;
    const announcement = await channel.send(opts.announceText).catch(() => null);
    if (
      !announcement ||
      typeof (announcement as { startThread?: unknown }).startThread !== 'function'
    ) {
      return null;
    }
    const thread = await (announcement as {
      startThread: (o: { name: string; autoArchiveDuration: number }) => Promise<unknown>;
    })
      .startThread({
        name: opts.threadName.slice(0, 100),
        autoArchiveDuration: opts.autoArchiveMinutes ?? 60,
      })
      .catch(() => null);
    if (!thread || !hasId(thread)) return null;
    return thread;
  } catch (e) {
    console.error('[battle] recreate thread fail:', errMsg(e));
    return null;
  }
}
```

- [ ] **Step 2: Refactor AmbushService.recreateThreadFor → użyj shared helper**

Zastąp obecną metodę:

```typescript
private async recreateThreadFor(state: AmbushBattleState, playerId: string): Promise<unknown> {
  const players = state.combatants
    .filter((c) => c.team === 0)
    .map((c) => `<@${c.id}>`)
    .join(' ');
  return recreateBattleThread(this.client, state, {
    threadName: `Ambush (resume): ${playerId}`,
    announceText: `⚔️ ${players} — wątek ambushu został odtworzony, kontynuujcie walkę!`,
  });
}
```

Dodaj import `recreateBattleThread` w ambush.ts.

- [ ] **Step 3: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 370/370 zielony.

- [ ] **Step 4: Commit Tasks 1+2**

```bash
git add src/modules/game/engine/battle-state.ts src/modules/game/engine/battle-helpers.ts src/modules/game/engine/ambush.ts src/modules/game/services/dungeon.service.ts src/modules/game/services/boss.service.ts src/modules/game/engine/world-boss.ts
git commit -m "refactor: extract recreateBattleThread + add parentChannelId to BattleState"
```

---

### Task 3: Add `getActiveStateForPlayer` + `resumeForPlayer` do Dungeon/Boss/WorldBoss

- [ ] **Step 1: DungeonService.getActiveStateForPlayer + resumeForPlayer**

W `src/modules/game/services/dungeon.service.ts` w klasie:

```typescript
import { recreateBattleThread } from '../engine/battle-helpers.js';
// ...

/** Zwraca aktywny dungeon state gracza (jeśli jest). */
getActiveStateForPlayer(playerId: string): DungeonBattleState | undefined {
  for (const state of this.states.values()) {
    if (state.finished) continue;
    if (state.combatants.some((c) => c.team === 0 && c.id === playerId && c.hp > 0)) {
      return state;
    }
  }
  return undefined;
}

/**
 * Resume dungeon battle dla gracza. Recreate thread jeśli zniknął.
 * Po hydrate state.thread === null — od razu recreate.
 */
async resumeForPlayer(
  client: Client,
  playerId: string,
): Promise<{ ok: boolean; threadId?: string }> {
  const state = this.getActiveStateForPlayer(playerId);
  if (!state) return { ok: false };

  const memberTags = state.partyMemberIds.map((id) => `<@${id}>`).join(' ');
  const opts = {
    threadName: `Dungeon (resume): ${state.dungeonId}`,
    announceText: `🏰 ${memberTags} — wątek dungeonu odtworzony, kontynuujcie walkę!`,
  };

  if (state.thread === null) {
    const newThread = await recreateBattleThread(client, state, opts);
    if (!newThread) return { ok: false };
    return this.attachNewThread(state, newThread, playerId);
  }

  // Live thread — try unarchive + send
  try {
    if (typeof state.thread.setArchived === 'function') {
      await state.thread.setArchived(false).catch(() => {});
    }
    await state.thread.send(`🏰 <@${playerId}> wraca do walki w dungeonie.`);
    await promptHumansWithPanel(state);
    return { ok: true, threadId: state.thread.id };
  } catch {
    const newThread = await recreateBattleThread(client, state, opts);
    if (!newThread) return { ok: false };
    return this.attachNewThread(state, newThread, playerId);
  }
}

private async attachNewThread(
  state: DungeonBattleState,
  newThread: unknown,
  playerId: string,
): Promise<{ ok: boolean; threadId?: string }> {
  if (!newThread || typeof newThread !== 'object' || !('id' in newThread)) return { ok: false };
  const tid = (newThread as { id: string }).id;
  this.states.delete(state.id);
  state.id = tid;
  state.thread = newThread;
  state.promptMessageIds.clear();
  this.states.set(tid, state);
  await this.battleStore.updateThreadId(state._battleId, tid);
  try {
    await state.thread.send(`🏰 <@${playerId}> wraca do walki w dungeonie.`);
    await promptHumansWithPanel(state);
  } catch {
    return { ok: false };
  }
  return { ok: true, threadId: tid };
}
```

(Importy: `Client` z discord.js, `promptHumansWithPanel` z battle-helpers.)

`resumeForPlayer` przyjmuje `client: Client` jako parametr (nie injectowany w konstruktorze) — żeby uniknąć dodawania kolejnej dependencji do DungeonService.

- [ ] **Step 2: BossService analogicznie**

W `boss.service.ts` dodaj `getActiveStateForPlayer` + `resumeForPlayer` analogicznie. Niewielkie różnice:
- Single-player; brak `partyMemberIds`
- announce: `👹 <@playerId> — wątek z bossem odtworzony`

- [ ] **Step 3: WorldBossService analogicznie**

W `world-boss.ts` analogicznie ale na `this.battles` Map (nie `this.states`):
- Multi-player jak dungeon, użyj `state.participantIds`
- announce: `🌋 ${tags} — wątek world-bossa odtworzony`

- [ ] **Step 4: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

Expected: 370/370 zielony.

- [ ] **Step 5: Commit**

```bash
git add src/modules/game/services/dungeon.service.ts src/modules/game/services/boss.service.ts src/modules/game/engine/world-boss.ts
git commit -m "feat: add resumeForPlayer to Dungeon/Boss/WorldBoss services"
```

---

### Task 4: ExpeditionService aggregates active battles + routes resume

- [ ] **Step 1: Bind 3 dodatkowe services**

W `src/modules/game/services/expedition.service.ts` dodaj pola:

```typescript
private dungeonService?: DungeonService;
private bossService?: BossService;
private worldBossService?: WorldBossService;

bindDungeonService(svc: DungeonService): void { this.dungeonService = svc; }
bindBossService(svc: BossService): void { this.bossService = svc; }
bindWorldBossService(svc: WorldBossService): void { this.worldBossService = svc; }
```

(Imports z odpowiednich plików.)

- [ ] **Step 2: Aggregate `inActiveBattle`**

Zastąp `inAmbush` (lub dodaj alongside):

```typescript
private inActiveBattle(player: PlayerStats): boolean {
  if (this.inAmbush(player)) return true;
  if (this.dungeonService?.getActiveStateForPlayer(player.id)) return true;
  if (this.bossService?.getActiveStateForPlayer(player.id)) return true;
  if (this.worldBossService?.getActiveStateForPlayer(player.id)) return true;
  return false;
}
```

Update wszystkie `this.inAmbush(player)` w `buildExpActiveRows(...)` calls na `this.inActiveBattle(player)`. Zostaw `inAmbush` dla `renderActiveContent` (gdzie konkretnie ambush info).

- [ ] **Step 3: handleResume — try each service**

```typescript
private async handleResume(
  interaction: ButtonInteraction,
  player: PlayerStats,
): Promise<void> {
  // Try ambush
  if (this.ambushService) {
    const r = await this.ambushService.resumeForPlayer(player.id);
    if (r.ok) {
      await interaction.reply({
        content: `⚔️ Panel akcji odświeżony w <#${r.threadId}>.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
  }
  // Try dungeon
  if (this.dungeonService) {
    const r = await this.dungeonService.resumeForPlayer(interaction.client, player.id);
    if (r.ok) {
      await interaction.reply({
        content: `🏰 Wracasz do dungeonu — <#${r.threadId}>.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
  }
  // Try boss
  if (this.bossService) {
    const r = await this.bossService.resumeForPlayer(interaction.client, player.id);
    if (r.ok) {
      await interaction.reply({
        content: `👹 Wracasz do walki z bossem — <#${r.threadId}>.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
  }
  // Try world boss
  if (this.worldBossService) {
    const r = await this.worldBossService.resumeForPlayer(interaction.client, player.id);
    if (r.ok) {
      await interaction.reply({
        content: `🌋 Wracasz na world boss — <#${r.threadId}>.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
  }
  await interaction.reply({
    content: 'Nie masz aktywnej walki — być może już się skończyła.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}
```

- [ ] **Step 4: DI w `src/modules/game/index.ts`**

Po stworzeniu DungeonService/BossService/WorldBossService:

```typescript
expeditions.bindDungeonService(dungeons);
expeditions.bindBossService(bosses);
// WorldBoss jest tworzony w startWorldBossLoop — bind tam:
expeditions.bindWorldBossService(wb);
```

(Dla world-boss: `services.expeditions.bindWorldBossService(wb);` w `startWorldBossLoop` przed `wb.start()`.)

- [ ] **Step 5: Typecheck + tests**

```bash
bun run tsc --noEmit
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/game/services/expedition.service.ts src/modules/game/index.ts
git commit -m "feat: aggregated 'Wróć do walki' for ambush/dungeon/boss/worldboss"
```

---

### Task 5: Final verification

```bash
bun run tsc --noEmit
bun run lint
bun test
```

Expected: ≥370/370 zielony.
