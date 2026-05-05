import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  fmtResource,
  fmtInstance,
  itemSellPrice,
  type ItemInstance,
  type ItemSlot,
} from './items.js';
import { displayName, errMsg } from '../../../utils.js';
import { deleteThreadNow } from '../engine/battle-helpers.js';

interface InventoryState {
  userId: string;
  userName: string;
  thread: InventoryThread;
  /** Lista itemów w kolejności wyświetlanej (1-based dla użytkownika). */
  itemList: ItemInstance[];
  listingMessageId?: string;
  idleTimer?: NodeJS.Timeout;
}

interface InventoryThread {
  id: string;
  send: (payload: unknown) => Promise<{ id: string }>;
  setArchived: (state: boolean) => Promise<unknown>;
  members?: { add: (userId: string) => Promise<unknown> };
  messages: { fetch: (id: string) => Promise<{ edit: (payload: unknown) => Promise<unknown> }> };
}

const INVENTORY_IDLE_TIMEOUT_MS = 5 * 60_000;
const VALID_SLOTS: readonly ItemSlot[] = ['weapon', 'armor', 'tool'];

/** Parsuje argumenty `sell N M K` na unikalne 1-based indexy [1, max]. */
function parseUniqueIndices(args: string[], max: number): number[] {
  const seen = new Set<number>();
  for (const a of args) {
    const n = parseInt(a, 10);
    if (Number.isFinite(n) && n >= 1 && n <= max) seen.add(n);
  }
  return [...seen];
}

function isInventoryThread(t: unknown): t is InventoryThread {
  if (!t || typeof t !== 'object') return false;
  if (!('id' in t) || typeof t.id !== 'string') return false;
  if (!('send' in t) || typeof t.send !== 'function') return false;
  if (!('setArchived' in t) || typeof t.setArchived !== 'function') return false;
  if (!('messages' in t) || !t.messages || typeof t.messages !== 'object') return false;
  return true;
}

/**
 * Plecak gracza w prywatnym wątku — single message z indexed listing,
 * text commands jako akcje. ~50× mniej API calls niż per-item buttony.
 *
 * Komendy w wątku:
 *   `.sell N M K`  → sprzedaj itemy o tych indexach (batch, equipped pomijane)
 *   `.equip N`     → załóż item (lub `equip N`)
 *   `.unequip <weapon|armor|tool>` → zdejmij ze slotu
 *   `.use <id>`    → użyj consumable (np. `potion_small`)
 *   `.close`       → zamknij plecak
 */
export class InventoryService {
  private readonly states = new Map<string, InventoryState>();

  constructor(private readonly stats: PlayerStatsService) {}

  /** `.inv` z command — otwiera lub przekierowuje na komendy in-thread. */
  async show(ctx: ICommandContext): Promise<void> {
    const { msg, registerThread, prompt } = ctx;
    const userId = msg.author.id;
    const channelId = msg.channel?.id;

    // Jeśli wiadomość jest w jakimś wątku plecaka — sprawdź czy to wątek
    // tego użytkownika; obcy nie mogą wywoływać komend (ochrona przed
    // sprzedażą cudzych itemów gdyby ktoś dołączył do prywatnego wątku).
    if (channelId) {
      const ownerState = this.findStateByThreadId(channelId);
      if (ownerState && ownerState.userId !== userId) {
        await msg
          .reply(
            `🚫 To plecak <@${ownerState.userId}> — nie możesz tu używać komend.`,
          )
          .catch(() => {});
        return;
      }
      if (ownerState && ownerState.userId === userId) {
        await this.handleThreadCommand(msg, ownerState, prompt);
        return;
      }
    }

    // Stale state (np. user usunął wątek lub bot restartował) — `openInventoryForUser`
    // sam czyści pamięć i otwiera świeży, nie blokujemy tutaj.
    await this.openInventoryForUser({
      userId,
      userName: displayName(msg),
      channel: msg.channel,
      registerThread,
      reply: (content: string) => msg.reply(content),
      startThreadFallback: (opts) => msg.startThread(opts),
    });
  }

  /** Znajduje state plecaka wg id wątku — używane do weryfikacji ownership. */
  private findStateByThreadId(threadId: string): InventoryState | undefined {
    for (const state of this.states.values()) {
      if (state.thread.id === threadId) return state;
    }
    return undefined;
  }

  async openInventoryForUser(args: {
    userId: string;
    userName: string;
    channel: { threads?: { create: (opts: unknown) => Promise<unknown> } };
    registerThread: (thread: unknown) => void;
    reply: (content: string) => Promise<unknown>;
    startThreadFallback?: (opts: {
      name: string;
      autoArchiveDuration: number;
    }) => Promise<unknown>;
  }): Promise<void> {
    // Stale state (np. user usunął wątek w Discord, ale bot pamięta) →
    // wyczyść w pamięci i otwórz świeży. NIE delete starego threada bo
    // Discord może zwrócić error gdy go już nie ma — niech sam się
    // zarchiwizuje przez TTL.
    const existing = this.states.get(args.userId);
    if (existing) {
      if (existing.idleTimer) clearTimeout(existing.idleTimer);
      this.states.delete(args.userId);
    }
    const player = this.stats.get(args.userId, args.userName);

    let thread: unknown;
    try {
      if (!args.channel.threads?.create) throw new Error('channel has no threads.create');
      thread = await args.channel.threads.create({
        name: `Plecak: ${player.name}`.slice(0, 100),
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        invitable: false,
      });
    } catch {
      if (!args.startThreadFallback) {
        await args.reply('Nie udało się otworzyć wątku plecaka (brak uprawnień).');
        return;
      }
      try {
        thread = await args.startThreadFallback({
          name: `Plecak: ${player.name}`.slice(0, 100),
          autoArchiveDuration: 60,
        });
      } catch (e) {
        await args.reply(`Nie udało się otworzyć wątku plecaka: ${errMsg(e)}`);
        return;
      }
    }
    if (!isInventoryThread(thread)) {
      await args.reply('Wątek plecaka utworzony, ale brak wymaganego API.');
      return;
    }
    if (thread.members) {
      await thread.members.add(args.userId).catch(() => {});
    }
    if (thread.id) args.registerThread(thread);

    const itemList = this.sortedItems(player);
    const state: InventoryState = {
      userId: args.userId,
      userName: args.userName,
      thread,
      itemList,
    };

    const listing = await thread
      .send({
        content: this.renderListing(player, itemList),
        components: [this.buildCloseRow(args.userId)],
      })
      .catch(() => null);
    if (
      listing &&
      typeof listing === 'object' &&
      'id' in listing &&
      typeof listing.id === 'string'
    ) {
      state.listingMessageId = listing.id;
    }

    this.states.set(args.userId, state);
    this.resetIdleTimer(state);
  }

  /**
   * Komendy w wątku plecaka — `.sell 1 2`, `.equip 3`, `.unequip weapon`,
   * `.use potion_small`, `.close`. `prompt` nie zawiera prefixu `.inv`.
   */
  async handleThreadCommand(msg: any, state: InventoryState, prompt: string): Promise<void> {
    this.resetIdleTimer(state);
    const player = this.stats.get(state.userId);
    const text = (prompt ?? '').trim().toLowerCase().replace(/^\.+/, '');
    if (!text) {
      await this.refreshListing(state);
      return;
    }
    const [cmd, ...rest] = text.split(/\s+/);

    if (cmd === 'close') {
      await msg.reply('🎒 Plecak zamknięty.').catch(() => {});
      await this.closeState(state);
      return;
    }
    if (cmd === 'sell') {
      await this.cmdSell(msg, state, player, rest);
      return;
    }
    if (cmd === 'equip' || cmd === 'eq') {
      await this.cmdEquip(msg, state, player, rest[0]);
      return;
    }
    if (cmd === 'unequip' || cmd === 'uneq') {
      await this.cmdUnequip(msg, state, player, rest[0]);
      return;
    }
    if (cmd === 'help' || cmd === '?') {
      await msg
        .reply(
          'Komendy: `sell N M K` (batch) · `equip N` · `unequip weapon|armor|tool` · `close`',
        )
        .catch(() => {});
      return;
    }
    await msg
      .reply(
        `Nieznana komenda \`${cmd}\`. Dostępne: \`sell N M\`, \`equip N\`, \`unequip <slot>\`, \`close\`, \`help\` (bez prefixów \`.inv\`).`,
      )
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('inv:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
      await interaction
        .reply({ content: 'To nie twój plecak.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const state = this.states.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Plecak już zamknięty — otwórz go ponownie `.inv` lub z `.menu`.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    this.resetIdleTimer(state);

    if (action === 'close') {
      await interaction
        .update({ content: '🎒 Plecak zamknięty.', components: [] })
        .catch(() => {});
      await this.closeState(state);
    }
  }

  // ── Commands ─────────────────────────────────────────

  private async cmdSell(
    msg: any,
    state: InventoryState,
    player: PlayerStats,
    args: string[],
  ): Promise<void> {
    if (args.length === 0) {
      await msg.reply('Użycie: `sell N M K` — gdzie N M K to indexy z plecaka.').catch(() => {});
      return;
    }
    const indices = parseUniqueIndices(args, state.itemList.length);
    if (indices.length === 0) {
      await msg.reply('Niewłaściwe indexy. Sprawdź listę itemów (numery 1-N).').catch(() => {});
      return;
    }
    const sold: Array<{ name: string; price: number }> = [];
    const skipped: string[] = [];
    // Sortujemy desc → usuwanie z items[] nie przesuwa indexów które jeszcze
    // przerabiamy. Indexy w `state.itemList` są też niezmienne dopóki
    // nie zrobimy refreshListing.
    for (const idx of [...indices].sort((a, b) => b - a)) {
      const item = state.itemList[idx - 1];
      if (!item) continue;
      const fresh = this.stats.findItem(player, item.uid);
      if (!fresh) {
        skipped.push(`#${idx} (już nie ma)`);
        continue;
      }
      if (!fresh.slot) {
        skipped.push(`#${idx} ${fresh.name} (nie equipable)`);
        continue;
      }
      if (player.equipped[fresh.slot] === fresh.uid) {
        skipped.push(`#${idx} ${fresh.name} (założony — najpierw \`unequip ${fresh.slot}\`)`);
        continue;
      }
      const price = itemSellPrice(fresh);
      const removed = this.stats.removeItem(player, fresh.uid);
      if (!removed) {
        skipped.push(`#${idx} ${fresh.name} (nie udało się usunąć)`);
        continue;
      }
      this.stats.addGold(player, price);
      sold.push({ name: fresh.name, price });
    }
    this.stats.save();

    const lines: string[] = [];
    if (sold.length > 0) {
      const total = sold.reduce((s, x) => s + x.price, 0);
      lines.push(
        `💰 Sprzedano ${sold.length}: ${sold.map((s) => `${s.name} (${s.price}g)`).join(', ')} — łącznie **${total}g**.`,
      );
    }
    if (skipped.length > 0) {
      lines.push(`⚠️ Pominięte: ${skipped.join(', ')}`);
    }
    await msg.reply(lines.join('\n') || 'Nic nie sprzedano.').catch(() => {});
    await this.refreshListing(state);
  }

  private async cmdEquip(
    msg: any,
    state: InventoryState,
    player: PlayerStats,
    arg: string | undefined,
  ): Promise<void> {
    if (!arg) {
      await msg.reply('Użycie: `equip N` — gdzie N to index z plecaka.').catch(() => {});
      return;
    }
    const idx = parseInt(arg, 10);
    if (!Number.isFinite(idx) || idx < 1 || idx > state.itemList.length) {
      await msg.reply(`Niewłaściwy index: \`${arg}\`. Plecak ma ${state.itemList.length} itemów.`).catch(() => {});
      return;
    }
    const target = state.itemList[idx - 1];
    const fresh = this.stats.findItem(player, target.uid);
    if (!fresh || !fresh.slot) {
      await msg.reply('Nie posiadasz już tego itemu (lub nie da się go założyć).').catch(() => {});
      return;
    }
    const result = this.stats.equip(player, fresh.uid);
    if (!result.ok) {
      await msg.reply(`🚫 ${result.reason ?? 'Nie udało się założyć.'}`).catch(() => {});
      return;
    }
    this.stats.save();
    await msg.reply(`⤴️ Założono **${fresh.name}** (slot: ${fresh.slot}).`).catch(() => {});
    await this.refreshListing(state);
  }

  private async cmdUnequip(
    msg: any,
    state: InventoryState,
    player: PlayerStats,
    slotArg: string | undefined,
  ): Promise<void> {
    if (!slotArg) {
      await msg.reply('Użycie: `unequip weapon` / `unequip armor` / `unequip tool`.').catch(() => {});
      return;
    }
    const slot = slotArg as ItemSlot;
    if (!VALID_SLOTS.includes(slot)) {
      await msg.reply(`Nieznany slot \`${slotArg}\`. Dostępne: ${VALID_SLOTS.join(', ')}.`).catch(() => {});
      return;
    }
    const removed = this.stats.unequip(player, slot);
    if (!removed) {
      await msg.reply(`Slot **${slot}** był pusty.`).catch(() => {});
      return;
    }
    this.stats.save();
    await msg.reply(`⤵️ Zdjęto **${removed.name}** ze slotu **${slot}**.`).catch(() => {});
    await this.refreshListing(state);
  }

  // ── Listing render ────────────────────────────────────

  private renderListing(player: PlayerStats, itemList: ItemInstance[]): string {
    const lines: string[] = [
      `🎒 **Plecak ${player.name}** | 💰 **${player.gold}g** | combat L${player.skills.combat.level}`,
      `❤️ HP **${this.stats.effectiveMaxHp(player)}** · ⚔️ Dmg **+${this.stats.effectiveDamageBonus(player)}** · 🛡️ Def **+${this.stats.effectiveDefenseBonus(player)}** · 💥 Crit **${this.stats.effectiveCritPercent(player).toFixed(1)}%** · ⚡ Spd **${this.stats.effectiveSpeed(player)}** · SP **${this.stats.spellPower(player)}**`,
      '',
      '**Założone:**',
    ];
    for (const slot of VALID_SLOTS) {
      const it = this.stats.equippedItem(player, slot);
      lines.push(`• ${slot}: ${it ? fmtInstance(it) : '_pusty_'}`);
    }

    lines.push('', `**Plecak (${itemList.length} unikalnych itemów):**`);
    if (itemList.length === 0) {
      lines.push('_(pusty)_');
    } else {
      for (let i = 0; i < itemList.length; i++) {
        const it = itemList[i];
        const isEquipped = it.slot ? player.equipped[it.slot] === it.uid : false;
        const tag = isEquipped ? ' **[założony]**' : '';
        const price = it.slot ? ` _[${itemSellPrice(it)}g]_` : '';
        lines.push(`**${i + 1}.** ${fmtInstance(it)}${tag}${price}`);
      }
    }

    const resources = Object.entries(player.inventory.resources);
    if (resources.length > 0) {
      lines.push('', '**Zasoby:**');
      const resLines = resources.map(([id, qty]) => fmtResource(id, qty));
      lines.push(resLines.join(' · '));
    }

    lines.push(
      '',
      '_Komendy (bez prefixu, w tym wątku):_ `sell N M K` · `equip N` · `unequip weapon|armor|tool` · `close`',
    );

    return lines.join('\n').slice(0, 1900);
  }

  private sortedItems(player: PlayerStats): ItemInstance[] {
    const equippedUids = new Set([
      player.equipped.weapon,
      player.equipped.armor,
      player.equipped.tool,
    ].filter(Boolean));
    return [...player.inventory.items].sort((a, b) => {
      const aE = equippedUids.has(a.uid) ? 0 : 1;
      const bE = equippedUids.has(b.uid) ? 0 : 1;
      if (aE !== bE) return aE - bE;
      return a.name.localeCompare(b.name);
    });
  }

  private async refreshListing(state: InventoryState): Promise<void> {
    if (!state.listingMessageId) return;
    const player = this.stats.get(state.userId);
    state.itemList = this.sortedItems(player);
    try {
      const m = await state.thread.messages.fetch(state.listingMessageId);
      await m
        .edit({
          content: this.renderListing(player, state.itemList),
          components: [this.buildCloseRow(state.userId)],
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  private buildCloseRow(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv:close:${userId}`)
        .setLabel('✖ Zamknij plecak')
        .setStyle(ButtonStyle.Danger),
    );
  }

  // ── Lifecycle ────────────────────────────────────────

  private async closeState(state: InventoryState): Promise<void> {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    this.states.delete(state.userId);
    await deleteThreadNow(state.thread, '🎒 Wątek plecaka zamknięty przez gracza — usuwam.');
  }

  private resetIdleTimer(state: InventoryState): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      this.autoClose(state).catch(() => {});
    }, INVENTORY_IDLE_TIMEOUT_MS);
    state.idleTimer.unref?.();
  }

  private async autoClose(state: InventoryState): Promise<void> {
    if (!this.states.has(state.userId)) return;
    this.states.delete(state.userId);
    await deleteThreadNow(state.thread, '⏰ Plecak zamknięty po 5 min braku interakcji.');
  }
}
