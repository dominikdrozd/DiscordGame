import { type ButtonInteraction } from 'discord.js';
import type { BattleCombatant, BattleState } from './battle-state.js';
import { findCombatant, aliveAllies, aliveEnemies } from './battle-state.js';
import { consumablesUsed } from './player-combatant.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { ITEMS } from '../services/items.js';
import {
  buildActionRow,
  buildItemPickerRow,
  buildPanelOpenerRow,
  buildSkillPickerRow,
  buildSkillTargetRow,
} from '../ui/battle-buttons.js';
import { getSkill, isOnCooldown } from '../skills/index.js';

/**
 * Acknowledge interakcji która trafia w nieaktualny stan (walka skończona / nieznany battleId).
 * Bez tego Discord pokazuje "This interaction failed".
 */
export async function ackStaleInteraction(interaction: ButtonInteraction): Promise<void> {
  await interaction
    .reply({ content: 'Walka już się zakończyła lub jest nieaktywna.', ephemeral: true })
    .catch(() => {});
}

interface ClosableThread {
  send(message: string): Promise<unknown>;
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
  await thread
    .send(`${postscript}\n_Wątek zostanie usunięty za ${seconds}s._`)
    .catch(() => {});
  await thread.setArchived(true).catch(() => {});
  scheduleThreadDelete(thread, THREAD_DELETE_DELAY_MS);
}

interface DeletableThread {
  send: (message: string) => Promise<unknown>;
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
      await thread.send(postscript).catch(() => {});
      await thread.setArchived(true).catch(() => {});
    }
    return;
  }
  await thread.send(postscript).catch(() => {});
  await thread.delete('User closed thread').catch(() => {});
}

interface SendableChannel {
  send: (payload: { content: string } | string) => Promise<unknown>;
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
    await parent.send(content).catch(() => {});
    return;
  }
  if (isClosableThread(thread)) {
    await thread.send(content).catch(() => {});
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
    await interaction
      .reply({ content: 'Brak itemów do użycia w combat.', ephemeral: true })
      .catch(() => {});
    return;
  }
  await interaction
    .reply({ content: 'Wybierz item:', ephemeral: true, components: [row] })
    .catch(() => {});
}

export async function recordItemPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, itemId] = interaction.customId.split(':');
  if (state.id !== battleId) {
    await interaction
      .update({ content: 'Ten przycisk dotyczy innej walki.', components: [] })
      .catch(() => {});
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await interaction
      .update({ content: 'To nie twój przycisk.', components: [] })
      .catch(() => {});
    return false;
  }
  if (state.pending.has(combatantId)) {
    await interaction
      .update({ content: 'Już wybrałeś akcję — czekamy na pozostałych.', components: [] })
      .catch(() => {});
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await interaction
      .update({ content: 'Już nie żyjesz w tej walce.', components: [] })
      .catch(() => {});
    return false;
  }

  // potion_small jest łączony — sprawdzamy zarówno darmowy pool (potionsLeft)
  // jak i plecak. Pozostałe consumables tylko z plecaka.
  if (itemId === 'potion_small') {
    const inv = me.consumables?.potion_small ?? 0;
    if (me.potionsLeft <= 0 && inv <= 0) {
      await interaction
        .update({ content: 'Brak mikstur (zero darmowych i zero w plecaku).', components: [] })
        .catch(() => {});
      return false;
    }
    state.pending.set(combatantId, { kind: 'item', itemId });
    await interaction
      .update({ content: 'Wybrałeś: 🧪 **Mikstura**.', components: [] })
      .catch(() => {});
    return true;
  }

  const have = me.consumables?.[itemId] ?? 0;
  if (have <= 0) {
    await interaction
      .update({ content: 'Brak takiego itemu w plecaku.', components: [] })
      .catch(() => {});
    return false;
  }
  state.pending.set(combatantId, { kind: 'item', itemId });
  const name = ITEMS[itemId]?.name ?? itemId;
  await interaction.update({ content: `Wybrałeś: **${name}**.`, components: [] }).catch(() => {});
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
    await interaction
      .reply({ content: 'Brak skilli — wybierz klasę przez `.class pick <id>`.', ephemeral: true })
      .catch(() => {});
    return;
  }
  await interaction
    .reply({ content: 'Wybierz skill:', ephemeral: true, components: [row] })
    .catch(() => {});
}

export async function handleSkillPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, skillId] = interaction.customId.split(':');
  if (state.id !== battleId) {
    await interaction
      .update({ content: 'Ten przycisk dotyczy innej walki.', components: [] })
      .catch(() => {});
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await interaction
      .update({ content: 'To nie twój przycisk.', components: [] })
      .catch(() => {});
    return false;
  }
  if (state.pending.has(combatantId)) {
    await interaction
      .update({ content: 'Już wybrałeś akcję — czekamy na pozostałych.', components: [] })
      .catch(() => {});
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await interaction
      .update({ content: 'Już nie żyjesz w tej walce.', components: [] })
      .catch(() => {});
    return false;
  }
  const skill = getSkill(skillId);
  if (!skill) {
    await interaction.update({ content: 'Nieznany skill.', components: [] }).catch(() => {});
    return false;
  }
  if (isOnCooldown(me, skillId)) {
    await interaction.update({ content: 'Skill na cooldownie.', components: [] }).catch(() => {});
    return false;
  }

  // self / allEnemies / allAllies — od razu rejestrujemy
  if (
    skill.targeting === 'self' ||
    skill.targeting === 'allEnemies' ||
    skill.targeting === 'allAllies'
  ) {
    state.pending.set(combatantId, { kind: 'skill', skillId });
    await interaction
      .update({ content: `Wybrano: **${skill.name}**.`, components: [] })
      .catch(() => {});
    return true;
  }

  // ally / enemy — pokazujemy target picker
  const targets = skill.targeting === 'enemy' ? aliveEnemies(state, me) : aliveAllies(state, me);
  if (targets.length === 0) {
    await interaction
      .update({ content: 'Brak żywych celów dla tego skilla.', components: [] })
      .catch(() => {});
    return false;
  }
  if (targets.length === 1) {
    state.pending.set(combatantId, { kind: 'skill', skillId, targetId: targets[0].id });
    await interaction
      .update({ content: `Wybrano: **${skill.name}** → **${targets[0].name}**.`, components: [] })
      .catch(() => {});
    return true;
  }
  const row = buildSkillTargetRow(battleId, combatantId, skillId, targets);
  await interaction
    .update({ content: `Cel dla **${skill.name}**:`, components: [row] })
    .catch(() => {});
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
    await interaction
      .update({ content: 'Ten przycisk dotyczy innej walki.', components: [] })
      .catch(() => {});
    return false;
  }
  if (interaction.user.id !== combatantId) {
    await interaction
      .update({ content: 'To nie twój przycisk.', components: [] })
      .catch(() => {});
    return false;
  }
  if (state.pending.has(combatantId)) {
    await interaction
      .update({ content: 'Już wybrałeś akcję — czekamy na pozostałych.', components: [] })
      .catch(() => {});
    return false;
  }
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) {
    await interaction
      .update({ content: 'Już nie żyjesz w tej walce.', components: [] })
      .catch(() => {});
    return false;
  }
  const skill = getSkill(skillId);
  if (!skill) {
    await interaction
      .update({ content: 'Nieznany skill.', components: [] })
      .catch(() => {});
    return false;
  }
  const target = findCombatant(state, targetId);
  if (!target || target.hp <= 0) {
    await interaction.update({ content: 'Cel padł.', components: [] }).catch(() => {});
    return false;
  }
  state.pending.set(combatantId, { kind: 'skill', skillId, targetId });
  await interaction
    .update({ content: `Wybrano: **${skill.name}** → **${target.name}**.`, components: [] })
    .catch(() => {});
  return true;
}

interface SendableThread {
  send: (
    payload: { content: string; components?: unknown[] } | string,
  ) => Promise<{ id: string }>;
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
  const sent = await state.thread.send({
    content: `🎮 Runda ${state.roundNumber} — ${mentions}, kliknij **Otwórz panel** żeby wybrać akcję.`,
    components: [buildPanelOpenerRow(state.id)],
  });
  state.promptMessageIds.set('__panel__', sent.id);
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
    await interaction
      .reply({ content: 'Nie bierzesz udziału w tej walce.', ephemeral: true })
      .catch(() => {});
    return;
  }
  if (me.hp <= 0) {
    await interaction
      .reply({ content: 'Już nie żyjesz w tej walce.', ephemeral: true })
      .catch(() => {});
    return;
  }
  if (state.pending.has(me.id)) {
    await interaction
      .reply({ content: 'Już wybrałeś akcję — czekamy na pozostałych.', ephemeral: true })
      .catch(() => {});
    return;
  }
  const hasSkills = (me.skills ?? []).length > 0;
  await interaction
    .reply({
      content: `🎮 Runda ${state.roundNumber} (${me.hp}/${me.maxHp} HP) — wybierz akcję:`,
      ephemeral: true,
      components: [buildActionRow(state.id, me.id, false, hasSkills)],
    })
    .catch(() => {});
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
  await state.thread.send(`✅ **${c.name}** wybrał akcję.`).catch(() => {});
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
