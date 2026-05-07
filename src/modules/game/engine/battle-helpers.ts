import { type ButtonInteraction, type Client } from 'discord.js';
import type { BattleCombatant, BattleState } from './battle-state.js';
import { findCombatant, aliveAllies, aliveEnemies } from './battle-state.js';
import { consumablesUsed } from './player-combatant.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { ITEMS } from '../services/items.js';
import { errMsg } from '../../../utils.js';
import {
  buildActionRow,
  buildItemPickerRow,
  buildPanelOpenerRow,
  buildSkillPickerRow,
  buildSkillTargetRow,
  buildTargetRow,
} from '../ui/battle-buttons.js';
import { getSkill, isOnCooldown } from '../skills/index.js';
import { chat } from '../../../managers/chat.manager.js';

/**
 * Acknowledge interakcji która trafia w nieaktualny stan (walka skończona / nieznany battleId).
 * Bez tego Discord pokazuje "This interaction failed".
 */
export async function ackStaleInteraction(interaction: ButtonInteraction): Promise<void> {
  await chat.reply(interaction, 'Walka już się zakończyła lub jest nieaktywna.', {
    ephemeral: true,
  });
}

interface ClosableThread {
  send(payload: unknown): Promise<unknown>;
  setArchived(state: boolean): Promise<unknown>;
}

function isClosableThread(t: unknown): t is ClosableThread {
  if (!t || typeof t !== 'object') return false;
  if (!('send' in t) || typeof t.send !== 'function') return false;
  if (!('setArchived' in t) || typeof t.setArchived !== 'function') return false;
  return true;
}

/** Czas między archiwizacją a usunięciem wątku post-walki — chroni przed spamem zarchiwizowanych wątków. */
export const THREAD_DELETE_DELAY_MS = 120_000;

function scheduleThreadDelete(thread: unknown, delayMs: number): void {
  if (!thread || typeof thread !== 'object') return;
  if (!('delete' in thread)) return;
  const fn = thread.delete;
  if (typeof fn !== 'function') return;
  const timer = setTimeout(() => {
    Promise.resolve(fn.call(thread, 'Battle thread auto-cleanup')).catch(() => {});
  }, delayMs);
  timer.unref?.();
}

/**
 * Wysyła pożegnalny komunikat, archiwizuje wątek i planuje jego usunięcie.
 * Po `THREAD_DELETE_DELAY_MS` (120s) wątek znika żeby nie spamował listy
 * zarchiwizowanych. Archiwizacja jest natychmiast — gracze widzą "wątek
 * zarchiwizowany" i wiedzą ile czasu mają na przeczytanie.
 *
 * Używane głównie przy AUTO-zakończeniu (koniec walki, idle timeout) gdzie
 * gracz może chcieć rzucić okiem na log. Dla user-initiated close (klik
 * "Zamknij") użyj `deleteThreadNow`.
 */
export async function closeBattleThread(thread: unknown, postscript: string): Promise<void> {
  if (!isClosableThread(thread)) return;
  const seconds = Math.round(THREAD_DELETE_DELAY_MS / 1000);
  await chat.send(thread, `${postscript}\n_Wątek zostanie usunięty za ${seconds}s._`);
  await thread.setArchived(true).catch(() => {});
  scheduleThreadDelete(thread, THREAD_DELETE_DELAY_MS);
}

interface DeletableThread {
  send: (payload: unknown) => Promise<unknown>;
  delete: (reason?: string) => Promise<unknown>;
}

function isDeletableThread(t: unknown): t is DeletableThread {
  if (!t || typeof t !== 'object') return false;
  if (!('send' in t) || typeof t.send !== 'function') return false;
  if (!('delete' in t) || typeof t.delete !== 'function') return false;
  return true;
}

/**
 * Natychmiast usuwa wątek po user-initiated close (klik "✖ Zamknij" w
 * sklepie/plecaku). Pomija archiwizację + 120s delay — user świadomie
 * zamknął, nie ma po co zostawiać artefaktu.
 *
 * Optymistyczny: postscript wysyłamy ale delete leci od razu (Discord
 * delete usuwa też wiadomości historyczne).
 */
export async function deleteThreadNow(thread: unknown, postscript: string): Promise<void> {
  if (!isDeletableThread(thread)) {
    if (isClosableThread(thread)) {
      await chat.send(thread, postscript);
      await thread.setArchived(true).catch(() => {});
    }
    return;
  }
  await chat.send(thread, postscript);
  await thread.delete('User closed thread').catch(() => {});
}

interface SendableChannel {
  send: (payload: unknown) => Promise<unknown>;
}

function isSendableChannel(c: unknown): c is SendableChannel {
  if (!c || typeof c !== 'object') return false;
  if (!('send' in c)) return false;
  return typeof c.send === 'function';
}

function getThreadParent(thread: unknown): SendableChannel | undefined {
  if (!thread || typeof thread !== 'object') return undefined;
  if (!('parent' in thread)) return undefined;
  const parent = thread.parent;
  return isSendableChannel(parent) ? parent : undefined;
}

/**
 * Wysyła publiczne podsumowanie po WYGRANEJ walce — na kanał-rodzic wątku
 * (zwykły czat), żeby było widoczne dla społeczności mimo że wątek
 * niedługo zostanie usunięty. Fallback: wysyła do wątku jeśli parent
 * niedostępny (np. testy / DM).
 */
export async function postBattleSummary(thread: unknown, content: string): Promise<void> {
  const parent = getThreadParent(thread);
  if (parent) {
    await chat.send(parent, content);
    return;
  }
  if (isClosableThread(thread)) {
    await chat.send(thread, content);
  }
}

export async function openItemPicker(
  interaction: ButtonInteraction,
  battleId: string,
  combatantId: string,
  combatant: BattleCombatant,
): Promise<void> {
  const consumables = combatant.consumables ?? {};
  const row = buildItemPickerRow(battleId, combatantId, consumables, combatant.potionsLeft);
  if (!row) {
    await chat.reply(interaction, 'Brak itemów do użycia w combat.', { ephemeral: true });
    return;
  }
  await chat.reply(interaction, 'Wybierz item:', { ephemeral: true, components: [row] });
}

export async function recordItemPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, itemId] = interaction.customId.split(':');
  if (state.id !== battleId) {
    await chat.update(interaction, 'Ten przycisk dotyczy innej walki.', { components: [] });
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await chat.update(interaction, 'To nie twój przycisk.', { components: [] });
    return false;
  }
  if (state.pending.has(combatantId)) {
    await chat.update(interaction, 'Już wybrałeś akcję — czekamy na pozostałych.', {
      components: [],
    });
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await chat.update(interaction, 'Już nie żyjesz w tej walce.', { components: [] });
    return false;
  }

  // potion_small jest łączony — sprawdzamy zarówno darmowy pool (potionsLeft)
  // jak i plecak. Pozostałe consumables tylko z plecaka.
  if (itemId === 'potion_small') {
    const inv = me.consumables?.potion_small ?? 0;
    if (me.potionsLeft <= 0 && inv <= 0) {
      await chat.update(interaction, 'Brak mikstur (zero darmowych i zero w plecaku).', {
        components: [],
      });
      return false;
    }
    state.pending.set(combatantId, { kind: 'item', itemId });
    await chat.update(interaction, 'Wybrałeś: 🧪 **Mikstura**.', { components: [] });
    return true;
  }

  const have = me.consumables?.[itemId] ?? 0;
  if (have <= 0) {
    await chat.update(interaction, 'Brak takiego itemu w plecaku.', { components: [] });
    return false;
  }
  state.pending.set(combatantId, { kind: 'item', itemId });
  const name = ITEMS[itemId]?.name ?? itemId;
  await chat.update(interaction, `Wybrałeś: **${name}**.`, { components: [] });
  return true;
}

export async function openSkillPicker(
  interaction: ButtonInteraction,
  battleId: string,
  combatantId: string,
  combatant: BattleCombatant,
): Promise<void> {
  const row = buildSkillPickerRow(battleId, combatantId, combatant);
  if (!row) {
    await chat.reply(interaction, 'Brak skilli — wybierz klasę przez `.class pick <id>`.', {
      ephemeral: true,
    });
    return;
  }
  await chat.reply(interaction, 'Wybierz skill:', { ephemeral: true, components: [row] });
}

export async function handleSkillPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, skillId] = interaction.customId.split(':');
  if (state.id !== battleId) {
    await chat.update(interaction, 'Ten przycisk dotyczy innej walki.', { components: [] });
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await chat.update(interaction, 'To nie twój przycisk.', { components: [] });
    return false;
  }
  if (state.pending.has(combatantId)) {
    await chat.update(interaction, 'Już wybrałeś akcję — czekamy na pozostałych.', {
      components: [],
    });
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await chat.update(interaction, 'Już nie żyjesz w tej walce.', { components: [] });
    return false;
  }
  const skill = getSkill(skillId);
  if (!skill) {
    await chat.update(interaction, 'Nieznany skill.', { components: [] });
    return false;
  }
  if (isOnCooldown(me, skillId)) {
    await chat.update(interaction, 'Skill na cooldownie.', { components: [] });
    return false;
  }

  // self / allEnemies / allAllies — od razu rejestrujemy
  if (
    skill.targeting === 'self' ||
    skill.targeting === 'allEnemies' ||
    skill.targeting === 'allAllies'
  ) {
    state.pending.set(combatantId, { kind: 'skill', skillId });
    await chat.update(interaction, `Wybrano: **${skill.name}**.`, { components: [] });
    return true;
  }

  // ally / enemy — pokazujemy target picker
  const targets = skill.targeting === 'enemy' ? aliveEnemies(state, me) : aliveAllies(state, me);
  if (targets.length === 0) {
    await chat.update(interaction, 'Brak żywych celów dla tego skilla.', { components: [] });
    return false;
  }
  if (targets.length === 1) {
    state.pending.set(combatantId, { kind: 'skill', skillId, targetId: targets[0].id });
    await chat.update(interaction, `Wybrano: **${skill.name}** → **${targets[0].name}**.`, {
      components: [],
    });
    return true;
  }
  const row = buildSkillTargetRow(battleId, combatantId, skillId, targets);
  await chat.update(interaction, `Cel dla **${skill.name}**:`, { components: [row] });
  return false;
}

export async function handleSkillTarget(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  // customId: `skltgt:battleId:combatantId:skillId:targetId` — targetId może mieć ':'
  const parts = interaction.customId.split(':');
  const [, battleId, combatantId, skillId] = parts;
  const targetId = parts.slice(4).join(':');
  if (state.id !== battleId) {
    await chat.update(interaction, 'Ten przycisk dotyczy innej walki.', { components: [] });
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await chat.update(interaction, 'To nie twój przycisk.', { components: [] });
    return false;
  }
  if (state.pending.has(combatantId)) {
    await chat.update(interaction, 'Już wybrałeś akcję — czekamy na pozostałych.', {
      components: [],
    });
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await chat.update(interaction, 'Już nie żyjesz w tej walce.', { components: [] });
    return false;
  }
  const skill = getSkill(skillId);
  if (!skill) {
    await chat.update(interaction, 'Nieznany skill.', { components: [] });
    return false;
  }
  const target = findCombatant(state, targetId);
  if (!target || target.hp <= 0) {
    await chat.update(interaction, 'Cel padł.', { components: [] });
    return false;
  }
  state.pending.set(combatantId, { kind: 'skill', skillId, targetId });
  await chat.update(interaction, `Wybrano: **${skill.name}** → **${target.name}**.`, {
    components: [],
  });
  return true;
}

interface SendableThread {
  send: (payload: unknown) => Promise<{ id: string }>;
  messages?: { fetch: (id: string) => Promise<{ edit: (payload: unknown) => Promise<unknown> }> };
}

function isSendableThread(t: unknown): t is SendableThread {
  if (!t || typeof t !== 'object') return false;
  if (!('send' in t)) return false;
  return typeof t.send === 'function';
}

/**
 * Wysyła pojedynczą publiczną wiadomość "Runda X — kliknij swój panel"
 * z buttonem `pnl:<battleId>`. Zastępuje per-user public action rows —
 * akcje gracz wybiera w ephemeral panelu po kliknięciu w opener.
 *
 * Idempotentne wobec startMessageIds: zapisuje id wiadomości pod kluczem
 * `__panel__` w `state.promptMessageIds`, dzięki czemu `maybeResolve`
 * potrafi wyłączyć button po rozliczeniu.
 */
export async function promptHumansWithPanel(state: BattleState): Promise<void> {
  if (!isSendableThread(state.thread)) return;
  const aliveHumans = state.combatants.filter((c) => c.controller === 'human' && c.hp > 0);
  if (aliveHumans.length === 0) return;
  const mentions = aliveHumans.map((c) => `<@${c.id}>`).join(' ');
  const sent = await chat.send(
    state.thread,
    `🎮 Runda ${state.roundNumber} — ${mentions}, kliknij **Otwórz panel** żeby wybrać akcję.`,
    { components: [buildPanelOpenerRow(state.id)] },
  );
  if (sent) state.promptMessageIds.set('__panel__', sent.id);
}

/**
 * Otwiera ephemeral panel akcji dla gracza po kliknięciu `pnl:<battleId>`.
 * Sprawdza czy gracz jest w walce, żywy i nie wybrał już akcji.
 */
export async function handlePanelOpen(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<void> {
  const me = findCombatant(state, interaction.user.id);
  if (!me || me.controller !== 'human') {
    await chat.reply(interaction, 'Nie bierzesz udziału w tej walce.', { ephemeral: true });
    return;
  }
  if (me.hp <= 0) {
    await chat.reply(interaction, 'Już nie żyjesz w tej walce.', { ephemeral: true });
    return;
  }
  if (state.pending.has(me.id)) {
    await chat.reply(interaction, 'Już wybrałeś akcję — czekamy na pozostałych.', {
      ephemeral: true,
    });
    return;
  }
  const hasSkills = (me.skills ?? []).length > 0;
  await chat.reply(
    interaction,
    `🎮 Runda ${state.roundNumber} (${me.hp}/${me.maxHp} HP) — wybierz akcję:`,
    { ephemeral: true, components: [buildActionRow(state.id, me.id, false, hasSkills)] },
  );
}

/**
 * Publiczne potwierdzenie do wątku po dokonaniu wyboru akcji — ujawnia tylko
 * fakt wyboru, nie szczegóły (cel/skill/item). Pozostali gracze widzą postęp
 * rundy, ale nie wiedzą co przeciwnik wybrał — efekt jak w klasycznych RPG.
 */
export async function notifyChoiceMade(state: BattleState, combatantId: string): Promise<void> {
  if (!isSendableThread(state.thread)) return;
  const c = findCombatant(state, combatantId);
  if (!c) return;
  await chat.send(state.thread, `✅ **${c.name}** wybrał akcję.`);
}

export function syncConsumablesAfterBattle(stats: PlayerStatsService, state: BattleState): void {
  let changed = false;
  for (const c of state.combatants) {
    if (c.controller !== 'human' || !c.consumablesStart) continue;
    const used = consumablesUsed(c.consumablesStart, c.consumables ?? {});
    if (Object.keys(used).length === 0) continue;
    const player = stats.get(c.id, c.name);
    for (const [itemId, qty] of Object.entries(used)) {
      stats.removeResource(player, itemId, qty);
    }
    changed = true;
  }
  if (changed) stats.save();
}

/**
 * Routing customId combat-buttonów do shared handlerów. Zastępuje 6 niemal
 * identycznych implementacji `handleInteraction` w services (ambush, dungeon,
 * arena, world-boss, duel, boss).
 *
 * Generic `S extends BattleState` pozwala servisowi przekazać własny rozszerzony
 * typ (DungeonBattleState, AmbushBattleState…) — handlery operują tylko na
 * polach z BattleState, ale callbacki dostają pełny typ.
 *
 * `getState(battleId)` zwraca state lub `undefined`. Brak state → silent return
 * (inne services dostaną szansę). State.finished → ackStaleInteraction.
 *
 * `onChoiceRecorded` wołane PO `notifyChoiceMade` — service-specific resolution
 * (`maybeResolve`, advance room, etc).
 */
export interface BattleRouterConfig<S extends BattleState> {
  getState: (battleId: string) => S | undefined;
  onChoiceRecorded?: (state: S, combatantId: string) => Promise<void>;
  /** Override "To nie twój X" dla bat:/tgt: — domyślnie "To nie twój przycisk." */
  notMineMessage?: string;
  /** Override "Już nie żyjesz w tym X" — domyślnie "Już nie żyjesz w tej walce." */
  alreadyDeadMessage?: string;
}

export async function routeBattleInteraction<S extends BattleState>(
  interaction: ButtonInteraction,
  config: BattleRouterConfig<S>,
): Promise<void> {
  if (!interaction.isButton?.()) return;
  const id = interaction.customId;
  const battleId = id.split(':')[1];
  if (!battleId) return;
  const state = config.getState(battleId);
  if (!state) return;
  if (state.finished) {
    await ackStaleInteraction(interaction);
    return;
  }

  const onRecorded = async (combatantId: string): Promise<void> => {
    await notifyChoiceMade(state, combatantId);
    if (config.onChoiceRecorded) await config.onChoiceRecorded(state, combatantId);
  };

  if (id.startsWith('pnl:')) {
    await handlePanelOpen(interaction, state);
    return;
  }
  if (id.startsWith('bat:')) {
    await handleBattleAction(interaction, state, {
      notMineMessage: config.notMineMessage,
      alreadyDeadMessage: config.alreadyDeadMessage,
      onChoiceRecorded: onRecorded,
    });
    return;
  }
  if (id.startsWith('tgt:')) {
    await handleBattleTarget(interaction, state, {
      notMineMessage: config.notMineMessage,
      onChoiceRecorded: onRecorded,
    });
    return;
  }
  if (id.startsWith('itmpick:')) {
    const recorded = await recordItemPick(interaction, state);
    if (recorded) await onRecorded(interaction.user.id);
    return;
  }
  if (id.startsWith('sklpick:')) {
    const recorded = await handleSkillPick(interaction, state);
    if (recorded) await onRecorded(interaction.user.id);
    return;
  }
  if (id.startsWith('skltgt:')) {
    const recorded = await handleSkillTarget(interaction, state);
    if (recorded) await onRecorded(interaction.user.id);
    return;
  }
}

interface ActionTargetOptions {
  notMineMessage?: string;
  alreadyDeadMessage?: string;
  onChoiceRecorded?: (combatantId: string) => Promise<void>;
}

/**
 * Wspólny handler dla customId `bat:battleId:combatantId:kind`. Kind:
 * `def` (set defend), `itm` (open item picker), `skl` (open skill picker),
 * `atk` (record attack — auto-pick gdy 1 enemy, target picker gdy >1).
 */
export async function handleBattleAction(
  interaction: ButtonInteraction,
  state: BattleState,
  options: ActionTargetOptions = {},
): Promise<void> {
  const [, battleId, combatantId, kind] = interaction.customId.split(':');
  if (interaction.user.id !== combatantId) {
    await chat.reply(interaction, options.notMineMessage ?? 'To nie twój przycisk.', {
      ephemeral: true,
    });
    return;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await chat.reply(interaction, options.alreadyDeadMessage ?? 'Już nie żyjesz w tej walce.', {
      ephemeral: true,
    });
    return;
  }
  if (state.pending.has(combatantId)) {
    await chat.reply(interaction, 'Już wybrałeś akcję.', { ephemeral: true });
    return;
  }

  if (kind === 'def') {
    state.pending.set(combatantId, { kind: 'defend' });
    await chat.reply(interaction, 'Wybrałeś: **Obrona**.', { ephemeral: true });
    if (options.onChoiceRecorded) await options.onChoiceRecorded(combatantId);
    return;
  }
  if (kind === 'itm') {
    await openItemPicker(interaction, battleId, combatantId, me);
    return;
  }
  if (kind === 'skl') {
    await openSkillPicker(interaction, battleId, combatantId, me);
    return;
  }
  if (kind === 'atk') {
    const enemies = aliveEnemies(state, me);
    if (enemies.length === 0) {
      await chat.reply(interaction, 'Brak żywych przeciwników.', { ephemeral: true });
      return;
    }
    if (enemies.length === 1) {
      state.pending.set(combatantId, { kind: 'attack', targetId: enemies[0].id });
      await chat.reply(interaction, `Atak na **${enemies[0].name}**.`, { ephemeral: true });
      if (options.onChoiceRecorded) await options.onChoiceRecorded(combatantId);
      return;
    }
    const row = buildTargetRow(battleId, combatantId, 'atk', enemies);
    await chat.reply(interaction, 'Wybierz cel:', { ephemeral: true, components: [row] });
    return;
  }
  await chat.reply(interaction, `Nieznana akcja \`${kind}\`.`, { ephemeral: true });
}

/**
 * Wspólny handler dla customId `tgt:battleId:combatantId:kind:targetId`.
 * Tylko `kind === 'atk'` aktualnie. TargetId może mieć dwukropki (mob ids
 * format `enemy:type:suffix`) — `parts.slice(4).join(':')`.
 */
export async function handleBattleTarget(
  interaction: ButtonInteraction,
  state: BattleState,
  options: ActionTargetOptions = {},
): Promise<void> {
  const parts = interaction.customId.split(':');
  const [, battleId, combatantId, kind] = parts;
  const targetId = parts.slice(4).join(':');
  if (interaction.user.id !== combatantId) {
    await chat.reply(interaction, options.notMineMessage ?? 'To nie twój wybór celu.', {
      ephemeral: true,
    });
    return;
  }
  if (state.pending.has(combatantId)) {
    await chat.update(interaction, 'Już wybrałeś akcję wcześniej.', { components: [] });
    return;
  }
  if (kind !== 'atk') {
    await chat.update(interaction, `Nieznany kind \`${kind}\`.`, { components: [] });
    return;
  }
  const me = findCombatant(state, combatantId);
  const target = findCombatant(state, targetId);
  if (target && target.hp > 0) {
    state.pending.set(combatantId, { kind: 'attack', targetId });
    await chat.update(interaction, `Wybrany: **${target.name}**.`, { components: [] });
    if (options.onChoiceRecorded) await options.onChoiceRecorded(combatantId);
    return;
  }
  // Cel padł — fallback na live enemy.
  if (!me) {
    await chat.update(interaction, 'Cel padł.', { components: [] });
    return;
  }
  const enemies = aliveEnemies(state, me);
  if (enemies.length === 0) {
    state.pending.set(combatantId, { kind: 'defend' });
    await chat.update(interaction, 'Cel padł — brak innych wrogów, idziesz w obronę.', {
      components: [],
    });
    if (options.onChoiceRecorded) await options.onChoiceRecorded(combatantId);
    return;
  }
  if (enemies.length === 1) {
    state.pending.set(combatantId, { kind: 'attack', targetId: enemies[0].id });
    await chat.update(interaction, `Cel padł — atakujesz **${enemies[0].name}**.`, {
      components: [],
    });
    if (options.onChoiceRecorded) await options.onChoiceRecorded(combatantId);
    return;
  }
  const row = buildTargetRow(battleId, combatantId, 'atk', enemies);
  await chat.update(interaction, 'Cel padł — wybierz innego:', { components: [row] });
}

interface RecreateOpts {
  /** Nazwa nowego threadu — np. `Ambush (resume): playerId`. Skracana do 100 chars. */
  threadName: string;
  /** Linia anonsu w parent channelu — np. `⚔️ <@p1> — wątek odtworzony`. */
  announceText: string;
  autoArchiveMinutes?: number;
}

interface RecreatedThread {
  id: string;
}

function isRecreatedThread(t: unknown): t is RecreatedThread {
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
    if (!isRecreatedThread(thread)) return null;
    return thread;
  } catch (e) {
    console.error('[battle] recreate thread fail:', errMsg(e));
    return null;
  }
}
