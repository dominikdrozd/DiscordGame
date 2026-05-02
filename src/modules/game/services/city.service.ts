import { ChannelType, type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { CITIES, getCity, listCities, type City, type Merchant } from '../cities/index.js';
import { ITEMS } from './items.js';
import { REGION_LVL_REQ } from '../engine/encounters.js';
import { displayName, errMsg } from '../../../utils.js';
import { buildShopItemRows, buildShopCloseRow } from '../ui/shop-buttons.js';
import { deleteThreadNow } from '../engine/battle-helpers.js';

interface ShopItem {
  merchantId: string;
  merchantName: string;
  merchantDescription: string;
  itemId: string;
  buyPrice: number;
  sellPrice: number;
}

interface ShopState {
  userId: string;
  cityId: string;
  cityName: string;
  items: ShopItem[];
  /** map itemId → discord message id (do refresh poszczególnej wiadomości po qty pick z ephemeral). */
  itemMessageIds: Map<string, string>;
  thread: ShopThread;
  /** zestaw itemId które są w sellMode (po Sprzedaj, przed pickiem qty). */
  sellModeItems: Set<string>;
  /** auto-close timer (5 min idle). */
  idleTimer?: NodeJS.Timeout;
}

interface ShopThread {
  id: string;
  send: (payload: unknown) => Promise<{ id: string }>;
  setArchived: (state: boolean) => Promise<unknown>;
  members?: { add: (userId: string) => Promise<unknown> };
  messages: { fetch: (id: string) => Promise<{ edit: (payload: unknown) => Promise<unknown> }> };
}

const SHOP_IDLE_TIMEOUT_MS = 5 * 60_000;

function shopKey(cityId: string, userId: string): string {
  return `${cityId}:${userId}`;
}

function flattenStock(city: City): ShopItem[] {
  const out: ShopItem[] = [];
  for (const m of city.merchants) {
    for (const s of m.stock) {
      out.push({
        merchantId: m.id,
        merchantName: m.name,
        merchantDescription: m.description,
        itemId: s.itemId,
        buyPrice: s.buyPrice,
        sellPrice: Math.floor(s.buyPrice * m.sellMultiplier),
      });
    }
  }
  return out;
}

function isShopThread(t: unknown): t is ShopThread {
  if (!t || typeof t !== 'object') return false;
  if (!('id' in t) || typeof t.id !== 'string') return false;
  if (!('send' in t) || typeof t.send !== 'function') return false;
  if (!('setArchived' in t) || typeof t.setArchived !== 'function') return false;
  if (!('messages' in t) || !t.messages || typeof t.messages !== 'object') return false;
  return true;
}

export class CityService {
  private readonly shops = new Map<string, ShopState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly isInDungeon: (userId: string) => boolean = () => false,
  ) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? '';

    if (!sub) return this.list(msg);
    if (sub === 'info') return this.info(msg, args[1]);
    if (sub === 'shop') return this.openShop(ctx, args[1]);
    if (sub === 'buy') return this.buy(msg, args[1], args[2], args[3]);
    if (sub === 'sell') return this.sell(msg, args[1], args[2]);

    await msg.reply(
      'Użycie: `.city` / `.city info <id>` / `.city shop <id>` / `.city buy <city> <item> [qty]` / `.city sell <item> [qty]`.',
    );
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('shop:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const cityId = parts[2];
    const userId = parts[3];
    const itemId = parts[4];
    const arg = parts[5];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój sklep.', ephemeral: true }).catch(() => {});
      return;
    }
    const state = this.shops.get(shopKey(cityId, userId));
    if (!state) {
      await interaction
        .reply({
          content: 'Sklep już zamknięty — otwórz go ponownie `.city shop <id>`.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    this.resetIdleTimer(state);

    if (action === 'buy') return this.handleBuy(interaction, state, itemId);
    if (action === 'sell') return this.handleSellMode(interaction, state, itemId);
    if (action === 'sellqty') return this.handleSellQty(interaction, state, itemId, arg);
    if (action === 'close') return this.handleClose(interaction, state);
  }

  private async list(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    const lines: string[] = ['🏛️ **Miasta:**', `_Twoje złoto:_ 💰 **${player.gold}**`, ''];
    for (const c of listCities().sort((a, b) => a.region - b.region)) {
      const minLvl = REGION_LVL_REQ[c.region];
      const accessible = player.skills.combat.level >= minLvl;
      const lock = accessible ? '' : ` 🔒 (wymaga combat lvl ${minLvl})`;
      lines.push(`• \`${c.id}\` — **${c.name}** (Region ${c.region})${lock} — ${c.description}`);
    }
    lines.push(
      '',
      'Użycie: `.city info <id>` (handlarze) · `.city shop <id>` (interaktywny sklep w prywatnym wątku) · `.city buy/sell` (klasyczne).',
    );
    await msg.reply(lines.join('\n').slice(0, 1900));
  }

  private async info(msg: any, cityId: string | undefined): Promise<void> {
    if (!cityId) {
      await msg.reply('Użycie: `.city info <id>`.');
      return;
    }
    const city = getCity(cityId);
    if (!city) {
      await msg.reply(`Nie ma miasta \`${cityId}\`. Wpisz \`.city\` żeby zobaczyć listę.`);
      return;
    }
    const player = this.stats.get(msg.author.id, displayName(msg));
    const minLvl = REGION_LVL_REQ[city.region];
    if (player.skills.combat.level < minLvl) {
      await msg.reply(
        `🚫 **${city.name}** leży w Regionie ${city.region} (${minLvl}+ combat lvl). Masz ${player.skills.combat.level}.`,
      );
      return;
    }
    const lines: string[] = [
      `🏛️ **${city.name}** (Region ${city.region})`,
      city.description,
      '',
      '**Handlarze:**',
    ];
    for (const m of city.merchants) {
      lines.push(`__${m.name}__ — ${m.description}`);
      const stockLines = m.stock
        .map((s) => `${ITEMS[s.itemId]?.name ?? s.itemId} — kup za **${s.buyPrice}** zł`)
        .join('; ');
      lines.push(`  Sklep: ${stockLines}. Skup: ${Math.round(m.sellMultiplier * 100)}% ceny.`);
    }
    lines.push(
      '',
      `_Twoje złoto:_ 💰 **${player.gold}**`,
      `Otwórz interaktywny sklep w prywatnym wątku: \`.city shop ${city.id}\`.`,
    );
    await msg.reply(lines.join('\n').slice(0, 1900));
  }

  private async openShop(ctx: ICommandContext, cityId: string | undefined): Promise<void> {
    const { msg, registerThread } = ctx;
    if (!cityId) {
      await msg.reply('Użycie: `.city shop <id>`.');
      return;
    }
    await this.openShopForUser({
      cityId,
      userId: msg.author.id,
      userName: displayName(msg),
      channel: msg.channel,
      registerThread,
      reply: (content: string) => msg.reply(content),
      startThreadFallback: (opts: { name: string; autoArchiveDuration: number }) =>
        msg.startThread(opts),
    });
  }

  /**
   * Niskopoziomowy entry point sklepu — używany zarówno z `.city shop <id>`
   * (przez `openShop`) jak i z buttona menu (przez `openShopFromInteraction`).
   *
   * Wymaga: kanału z `threads.create` (dla prywatnego wątku), `registerThread`
   * z `CommandManager` (dla TTL cleanup), `reply` (do błędów) i opcjonalnego
   * `startThreadFallback` jeśli prywatne wątki niedostępne.
   */
  async openShopForUser(args: {
    cityId: string;
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
    const city = getCity(args.cityId);
    if (!city) {
      await args.reply(`Nie ma miasta \`${args.cityId}\`.`);
      return;
    }
    const player = this.stats.get(args.userId, args.userName);

    if (player.activeExpedition) {
      await args.reply(
        '🚫 Jesteś na ekspedycji — wróć i zbierz nagrody (`.expedition claim`) zanim pójdziesz na zakupy.',
      );
      return;
    }
    if (this.isInDungeon(player.id)) {
      await args.reply('🚫 Jesteś w dungeonie — najpierw skończ walkę.');
      return;
    }

    const minLvl = REGION_LVL_REQ[city.region];
    if (player.skills.combat.level < minLvl) {
      await args.reply(
        `🚫 **${city.name}** wymaga combat lvl **${minLvl}**. Masz ${player.skills.combat.level}.`,
      );
      return;
    }
    if (this.shops.has(shopKey(city.id, args.userId))) {
      await args.reply(
        'Masz już otwarty sklep w tym mieście — zamknij poprzedni zanim otworzysz nowy.',
      );
      return;
    }
    const items = flattenStock(city);
    if (items.length === 0) {
      await args.reply(`W **${city.name}** nikt nic nie sprzedaje.`);
      return;
    }

    let thread: unknown;
    try {
      if (!args.channel.threads?.create) throw new Error('channel has no threads.create');
      thread = await args.channel.threads.create({
        name: `Sklep: ${city.name}`.slice(0, 100),
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        invitable: false,
      });
    } catch {
      if (!args.startThreadFallback) {
        await args.reply('Nie udało się otworzyć wątku sklepu (brak uprawnień).');
        return;
      }
      try {
        thread = await args.startThreadFallback({
          name: `Sklep: ${city.name}`.slice(0, 100),
          autoArchiveDuration: 60,
        });
      } catch (e) {
        await args.reply(`Nie udało się otworzyć wątku sklepu: ${errMsg(e)}`);
        return;
      }
    }
    if (!isShopThread(thread)) {
      await args.reply('Wątek sklepu został utworzony, ale nie ma wymaganego API.');
      return;
    }
    if (thread.members) {
      await thread.members.add(args.userId).catch(() => {});
    }
    if (thread.id) args.registerThread(thread);

    const state: ShopState = {
      userId: args.userId,
      cityId: city.id,
      cityName: city.name,
      items,
      itemMessageIds: new Map(),
      thread,
      sellModeItems: new Set(),
    };

    await thread
      .send({
        content: `🛒 **${city.name}** — witaj w sklepie. Kup lub sprzedaj klikając guziki przy każdym itemie. Sklep zamknie się sam po 5 min braku interakcji.`,
      })
      .catch(() => {});

    let groupedByMerchant = '';
    for (const item of items) {
      if (item.merchantId !== groupedByMerchant) {
        await thread
          .send({
            content: `__**${item.merchantName}**__ — _${item.merchantDescription}_`,
          })
          .catch(() => {});
        groupedByMerchant = item.merchantId;
      }
      const sent = await thread
        .send({
          content: this.renderItemContent(item, player, false),
          components: buildShopItemRows({
            cityId: state.cityId,
            userId: state.userId,
            itemId: item.itemId,
            buyPrice: item.buyPrice,
            haveQty: player.inventory.resources[item.itemId] ?? 0,
            playerGold: player.gold,
            sellMode: false,
          }),
        })
        .catch(() => null);
      if (sent && typeof sent === 'object' && 'id' in sent && typeof sent.id === 'string') {
        state.itemMessageIds.set(item.itemId, sent.id);
      }
    }

    await thread
      .send({
        content: '_Gdy skończysz zakupy, kliknij guzik poniżej:_',
        components: buildShopCloseRow(state.cityId, state.userId),
      })
      .catch(() => {});

    this.shops.set(shopKey(city.id, args.userId), state);
    this.resetIdleTimer(state);
  }

  private renderItemContent(item: ShopItem, player: PlayerStats, sellMode: boolean): string {
    const itemName = ITEMS[item.itemId]?.name ?? item.itemId;
    const have = player.inventory.resources[item.itemId] ?? 0;
    const lines = [
      `**${itemName}**`,
      `Kupno: **${item.buyPrice}** zł · Skup: **${item.sellPrice}** zł`,
      `Masz w plecaku: **${have}** szt. · Twoje złoto: 💰 **${player.gold}**`,
    ];
    if (sellMode) lines.push('Wybierz ile sprzedać:');
    return lines.join('\n');
  }

  private resetIdleTimer(state: ShopState): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      this.autoCloseShop(state).catch(() => {});
    }, SHOP_IDLE_TIMEOUT_MS);
    state.idleTimer.unref?.();
  }

  private async autoCloseShop(state: ShopState): Promise<void> {
    if (!this.shops.has(shopKey(state.cityId, state.userId))) return;
    this.shops.delete(shopKey(state.cityId, state.userId));
    await deleteThreadNow(state.thread, '⏰ Sklep zamknięty po 5 min braku interakcji.');
  }

  private findItem(state: ShopState, itemId: string): ShopItem | undefined {
    return state.items.find((i) => i.itemId === itemId);
  }

  private async refreshItemMessage(
    interaction: ButtonInteraction,
    state: ShopState,
    item: ShopItem,
  ): Promise<void> {
    const player = this.stats.get(state.userId);
    const sellMode = state.sellModeItems.has(item.itemId);
    await interaction
      .update({
        content: this.renderItemContent(item, player, sellMode),
        components: buildShopItemRows({
          cityId: state.cityId,
          userId: state.userId,
          itemId: item.itemId,
          buyPrice: item.buyPrice,
          haveQty: player.inventory.resources[item.itemId] ?? 0,
          playerGold: player.gold,
          sellMode,
        }),
      })
      .catch(() => {});
  }

  private async handleBuy(
    interaction: ButtonInteraction,
    state: ShopState,
    itemId: string | undefined,
  ): Promise<void> {
    const item = itemId ? this.findItem(state, itemId) : undefined;
    if (!item) {
      await interaction.reply({ content: 'Nieznany item.', ephemeral: true }).catch(() => {});
      return;
    }
    const player = this.stats.get(state.userId);
    if (!this.stats.hasGold(player, item.buyPrice)) {
      await interaction
        .reply({
          content: `Brakuje złota — masz ${player.gold}, potrzebujesz ${item.buyPrice}.`,
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    this.stats.removeGold(player, item.buyPrice);
    this.stats.addResource(player, item.itemId, 1);
    this.stats.save();
    state.sellModeItems.delete(item.itemId);
    await this.refreshItemMessage(interaction, state, item);
  }

  private async handleSellMode(
    interaction: ButtonInteraction,
    state: ShopState,
    itemId: string | undefined,
  ): Promise<void> {
    const item = itemId ? this.findItem(state, itemId) : undefined;
    if (!item) {
      await interaction.reply({ content: 'Nieznany item.', ephemeral: true }).catch(() => {});
      return;
    }
    const player = this.stats.get(state.userId);
    const have = player.inventory.resources[item.itemId] ?? 0;
    if (have <= 0) {
      await interaction
        .reply({ content: 'Nie masz tego itemu w plecaku.', ephemeral: true })
        .catch(() => {});
      return;
    }
    state.sellModeItems.add(item.itemId);
    await this.refreshItemMessage(interaction, state, item);
  }

  private async handleSellQty(
    interaction: ButtonInteraction,
    state: ShopState,
    itemId: string | undefined,
    qtyArg: string | undefined,
  ): Promise<void> {
    const item = itemId ? this.findItem(state, itemId) : undefined;
    if (!item) {
      await interaction.reply({ content: 'Nieznany item.', ephemeral: true }).catch(() => {});
      return;
    }
    const qty = Math.max(1, parseInt(qtyArg ?? '1', 10) || 1);
    const player = this.stats.get(state.userId);
    const have = player.inventory.resources[item.itemId] ?? 0;
    const sellQty = Math.min(qty, have);
    if (sellQty <= 0) {
      state.sellModeItems.delete(item.itemId);
      await this.refreshItemMessage(interaction, state, item);
      return;
    }
    this.stats.removeResource(player, item.itemId, sellQty);
    this.stats.addGold(player, item.sellPrice * sellQty);
    this.stats.save();
    const remaining = player.inventory.resources[item.itemId] ?? 0;
    if (remaining <= 0) state.sellModeItems.delete(item.itemId);
    await this.refreshItemMessage(interaction, state, item);
  }

  private async handleClose(interaction: ButtonInteraction, state: ShopState): Promise<void> {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    this.shops.delete(shopKey(state.cityId, state.userId));
    await interaction
      .update({
        content: `🛒 Sklep w **${state.cityName}** zamknięty. Wracaj do nas!`,
        components: [],
      })
      .catch(() => {});
    await deleteThreadNow(state.thread, '🛒 Wątek sklepu zamknięty przez gracza — usuwam.');
  }

  private async buy(
    msg: any,
    cityId: string | undefined,
    itemId: string | undefined,
    qtyArg: string | undefined,
  ): Promise<void> {
    if (!cityId || !itemId) {
      await msg.reply('Użycie: `.city buy <city_id> <item_id> [qty]`.');
      return;
    }
    const city = getCity(cityId);
    if (!city) {
      await msg.reply(`Nie ma miasta \`${cityId}\`.`);
      return;
    }
    const player = this.stats.get(msg.author.id, displayName(msg));
    const minLvl = REGION_LVL_REQ[city.region];
    if (player.skills.combat.level < minLvl) {
      await msg.reply(
        `🚫 **${city.name}** wymaga combat lvl **${minLvl}**. Masz ${player.skills.combat.level}.`,
      );
      return;
    }
    const merchantWithStock = city.merchants.find((m) => m.stock.some((s) => s.itemId === itemId));
    if (!merchantWithStock) {
      await msg.reply(`W **${city.name}** nikt nie sprzedaje \`${itemId}\`.`);
      return;
    }
    const stockEntry = merchantWithStock.stock.find((s) => s.itemId === itemId);
    if (!stockEntry) return;
    const qty = Math.max(1, parseInt(qtyArg ?? '1', 10) || 1);
    const totalCost = stockEntry.buyPrice * qty;
    if (!this.stats.hasGold(player, totalCost)) {
      await msg.reply(`Brakuje złota: potrzebujesz **${totalCost}**, masz **${player.gold}**.`);
      return;
    }
    this.stats.removeGold(player, totalCost);
    this.stats.addResource(player, itemId, qty);
    this.stats.save();
    await msg.reply(
      `🛒 **${merchantWithStock.name}** sprzedaje ci **${ITEMS[itemId]?.name ?? itemId} ×${qty}** za **${totalCost}** zł. Zostało: 💰 ${player.gold}.`,
    );
  }

  private async sell(
    msg: any,
    itemId: string | undefined,
    qtyArg: string | undefined,
  ): Promise<void> {
    if (!itemId) {
      await msg.reply(
        'Użycie: `.city sell <item_id> [qty]` (sprzedaż w aktualnie odwiedzanym mieście — wybierane automatycznie po najwyższej cenie skupu).',
      );
      return;
    }
    const player = this.stats.get(msg.author.id, displayName(msg));
    const have = player.inventory.resources[itemId] ?? 0;
    if (have <= 0) {
      await msg.reply(`Nie masz \`${itemId}\` w plecaku.`);
      return;
    }
    const qty = Math.max(1, Math.min(have, parseInt(qtyArg ?? `${have}`, 10) || have));

    let bestOffer: { city: string; merchant: Merchant; price: number } | undefined;
    for (const city of Object.values(CITIES)) {
      const minLvl = REGION_LVL_REQ[city.region];
      if (player.skills.combat.level < minLvl) continue;
      for (const m of city.merchants) {
        const stockEntry = m.stock.find((s) => s.itemId === itemId);
        if (!stockEntry) continue;
        const price = Math.floor(stockEntry.buyPrice * m.sellMultiplier);
        if (!bestOffer || price > bestOffer.price) {
          bestOffer = { city: city.name, merchant: m, price };
        }
      }
    }
    if (!bestOffer) {
      await msg.reply(
        `Żaden handlarz w odwiedzanych miastach nie skupuje \`${itemId}\`. Sprawdź \`.city info <id>\` żeby zobaczyć stocky.`,
      );
      return;
    }
    const totalEarned = bestOffer.price * qty;
    this.stats.removeResource(player, itemId, qty);
    this.stats.addGold(player, totalEarned);
    this.stats.save();
    await msg.reply(
      `💰 **${bestOffer.merchant.name}** w **${bestOffer.city}** kupuje **${ITEMS[itemId]?.name ?? itemId} ×${qty}** za **${totalEarned}** zł (po ${bestOffer.price}/szt). Złoto: ${player.gold}.`,
    );
  }
}
