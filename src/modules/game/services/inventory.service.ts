import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ButtonInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { fmtResource, fmtInstance, itemSellPrice, type ItemInstance } from './items.js';
import { displayName, errMsg } from '../../../utils.js';
import { deleteThreadNow } from '../engine/battle-helpers.js';

interface InventoryState {
  userId: string;
  userName: string;
  thread: InventoryThread;
  /** map item.uid → message id (do refresh per-item po toggle). */
  itemMessageIds: Map<string, string>;
  /** id summary message (stats/zasoby/header) na początku. */
  summaryMessageId?: string;
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

function isInventoryThread(t: unknown): t is InventoryThread {
  if (!t || typeof t !== 'object') return false;
  if (!('id' in t) || typeof t.id !== 'string') return false;
  if (!('send' in t) || typeof t.send !== 'function') return false;
  if (!('setArchived' in t) || typeof t.setArchived !== 'function') return false;
  if (!('messages' in t) || !t.messages || typeof t.messages !== 'object') return false;
  return true;
}

/**
 * Plecak gracza w prywatnym wątku — analogicznie do `.city shop`.
 * Każdy unikalny przedmiot dostaje własną wiadomość z buttonem
 * "⤴️ Załóż / ⤵️ Zdejmij" — refresh per-item zamiast całej listy.
 */
export class InventoryService {
  private readonly states = new Map<string, InventoryState>();

  constructor(private readonly stats: PlayerStatsService) {}

  /** `.inv` z command — otwiera wątek przez `msg.startThread` (back-compat). */
  async show(ctx: ICommandContext): Promise<void> {
    const { msg, registerThread } = ctx;
    await this.openInventoryForUser({
      userId: msg.author.id,
      userName: displayName(msg),
      channel: msg.channel,
      registerThread,
      reply: (content: string) => msg.reply(content),
      startThreadFallback: (opts) => msg.startThread(opts),
    });
  }

  /**
   * Niskopoziomowy entry point — używany z `.inv` (przez `show`) jak i
   * z buttona menu (`menu:inv`) przez adapter w `registerGameCommands`.
   */
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
    if (this.states.has(args.userId)) {
      await args.reply(
        'Masz już otwarty plecak — zamknij poprzedni (`✖ Zamknij plecak`) zanim otworzysz nowy.',
      );
      return;
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

    const state: InventoryState = {
      userId: args.userId,
      userName: args.userName,
      thread,
      itemMessageIds: new Map(),
    };

    const summary = await thread
      .send({ content: this.renderSummary(player) })
      .catch(() => null);
    if (summary && typeof summary === 'object' && 'id' in summary && typeof summary.id === 'string') {
      state.summaryMessageId = summary.id;
    }

    const equippableItems = player.inventory.items.filter((it) => it.slot);
    if (equippableItems.length === 0) {
      await thread
        .send({
          content: '_Brak unikalnych przedmiotów do założenia._ Spróbuj `.craft` lub bossów.',
        })
        .catch(() => {});
    } else {
      for (const it of equippableItems) {
        const sent = await thread
          .send({
            content: this.renderItemContent(it, player),
            components: [this.buildItemRow(it, player)],
          })
          .catch(() => null);
        if (sent && typeof sent === 'object' && 'id' in sent && typeof sent.id === 'string') {
          state.itemMessageIds.set(it.uid, sent.id);
        }
      }
    }

    await thread
      .send({
        content: '_Gdy skończysz, kliknij guzik poniżej:_',
        components: [this.buildCloseRow(args.userId)],
      })
      .catch(() => {});

    this.states.set(args.userId, state);
    this.resetIdleTimer(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('inv:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój plecak.', ephemeral: true }).catch(() => {});
      return;
    }
    const state = this.states.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Plecak już zamknięty — otwórz go ponownie `.inv` lub z `.menu`.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    this.resetIdleTimer(state);

    if (action === 'toggle') {
      const uid = parts[2];
      return this.handleToggle(interaction, state, uid);
    }
    if (action === 'sell') {
      const uid = parts[2];
      return this.handleSell(interaction, state, uid);
    }
    if (action === 'close') {
      return this.handleClose(interaction, state);
    }
  }

  private async handleToggle(
    interaction: ButtonInteraction,
    state: InventoryState,
    uid: string,
  ): Promise<void> {
    const player = this.stats.get(state.userId);
    const item = this.stats.findItem(player, uid);
    if (!item || !item.slot) {
      await interaction
        .reply({ content: 'Nie posiadasz już tego przedmiotu.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const wasEquipped = player.equipped[item.slot] === uid;
    let previouslyEquipped: ItemInstance | undefined;
    if (wasEquipped) {
      this.stats.unequip(player, item.slot);
    } else {
      // Jeśli inny item zajmował slot, zapamiętaj go żeby odświeżyć jego wiadomość.
      const prevUid = player.equipped[item.slot];
      if (prevUid) previouslyEquipped = this.stats.findItem(player, prevUid);
      this.stats.equip(player, uid);
    }
    this.stats.save();

    // Update klikniętego itemu via interaction.update (atomicznie).
    await interaction
      .update({
        content: this.renderItemContent(item, player),
        components: [this.buildItemRow(item, player)],
      })
      .catch(() => {});

    // Refresh messageu poprzednio założonego itemu (jego button też się zmienił).
    if (previouslyEquipped) {
      await this.refreshItem(state, previouslyEquipped);
    }

    // Refresh summary (HP/dmg/def w nagłówku zmieniają się przy equip).
    await this.refreshSummary(state);
  }

  private async handleSell(
    interaction: ButtonInteraction,
    state: InventoryState,
    uid: string,
  ): Promise<void> {
    const player = this.stats.get(state.userId);
    const item = this.stats.findItem(player, uid);
    if (!item || !item.slot) {
      await interaction
        .reply({ content: 'Nie posiadasz już tego przedmiotu.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (player.equipped[item.slot] === uid) {
      await interaction
        .reply({
          content: 'Najpierw zdejmij item — equipped nie sprzedasz.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    const price = itemSellPrice(item);
    const removed = this.stats.removeItem(player, uid);
    if (!removed) {
      await interaction
        .reply({ content: 'Nie udało się usunąć itemu.', ephemeral: true })
        .catch(() => {});
      return;
    }
    this.stats.addGold(player, price);
    this.stats.save();
    state.itemMessageIds.delete(uid);

    // Update klikniętej wiadomości — wyzeruj komponenty, pokaż info o sprzedaży.
    await interaction
      .update({
        content: `💰 Sprzedano ${fmtInstance(item)} za **${price}** zł.`,
        components: [],
      })
      .catch(() => {});

    // Refresh summary (zmieniło się złoto + lista założonych slotów).
    await this.refreshSummary(state);
  }

  private async refreshItem(state: InventoryState, item: ItemInstance): Promise<void> {
    const msgId = state.itemMessageIds.get(item.uid);
    if (!msgId) return;
    const player = this.stats.get(state.userId);
    try {
      const m = await state.thread.messages.fetch(msgId);
      await m
        .edit({
          content: this.renderItemContent(item, player),
          components: [this.buildItemRow(item, player)],
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  private async refreshSummary(state: InventoryState): Promise<void> {
    if (!state.summaryMessageId) return;
    const player = this.stats.get(state.userId);
    try {
      const m = await state.thread.messages.fetch(state.summaryMessageId);
      await m.edit({ content: this.renderSummary(player) }).catch(() => {});
    } catch {
      // ignore
    }
  }

  private async handleClose(
    interaction: ButtonInteraction,
    state: InventoryState,
  ): Promise<void> {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    this.states.delete(state.userId);
    await interaction
      .update({ content: `🎒 Plecak zamknięty. Wpisz \`.inv\` aby otworzyć ponownie.`, components: [] })
      .catch(() => {});
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

  private renderSummary(player: PlayerStats): string {
    const lines: string[] = [
      `🎒 **Plecak ${player.name}**`,
      `❤️ HP: **${this.stats.effectiveMaxHp(player)}** · ⚔️ Dmg: **+${this.stats.effectiveDamageBonus(player)}** · 🛡️ Def: **+${this.stats.effectiveDefenseBonus(player)}** · 💥 Crit: **${this.stats.effectiveCritPercent(player).toFixed(1)}%**`,
      '',
      '**Założone:**',
    ];
    for (const slot of ['weapon', 'armor', 'tool'] as const) {
      const it = this.stats.equippedItem(player, slot);
      lines.push(`• ${slot}: ${it ? fmtInstance(it) : '_pusty_'}`);
    }

    const resources = Object.entries(player.inventory.resources);
    if (resources.length > 0) {
      lines.push('', '**Zasoby:**');
      for (const [id, qty] of resources) lines.push(`• ${fmtResource(id, qty)}`);
    }

    return lines.join('\n').slice(0, 1900);
  }

  private renderItemContent(it: ItemInstance, player: PlayerStats): string {
    const isEquipped = it.slot ? player.equipped[it.slot] === it.uid : false;
    const tag = isEquipped ? ' **[założone]**' : '';
    const slotLabel = it.slot ? ` _(slot: ${it.slot})_` : '';
    const price = itemSellPrice(it);
    return `${fmtInstance(it)}${slotLabel}${tag}\n💰 Skup: **${price}** zł\n\`uid: ${it.uid}\``;
  }

  private buildItemRow(
    it: ItemInstance,
    player: PlayerStats,
  ): ActionRowBuilder<ButtonBuilder> {
    const isEquipped = it.slot ? player.equipped[it.slot] === it.uid : false;
    const price = itemSellPrice(it);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv:toggle:${it.uid}:${player.id}`)
        .setLabel(isEquipped ? '⤵️ Zdejmij' : '⤴️ Załóż')
        .setStyle(isEquipped ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`inv:sell:${it.uid}:${player.id}`)
        .setLabel(`💰 Sprzedaj (${price} zł)`.slice(0, 80))
        .setStyle(ButtonStyle.Success)
        .setDisabled(isEquipped),
    );
  }

  private buildCloseRow(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv:close:${userId}`)
        .setLabel('✖ Zamknij plecak')
        .setStyle(ButtonStyle.Danger),
    );
  }
}
