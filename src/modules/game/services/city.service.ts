import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from './player-stats.js';
import { CITIES, getCity, listCities, type Merchant } from '../cities/index.js';
import { ITEMS } from './items.js';
import { REGION_LVL_REQ } from '../engine/encounters.js';
import { displayName } from '../../../utils.js';

export class CityService {
  constructor(private readonly stats: PlayerStatsService) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? '';

    if (!sub) return this.list(msg);
    if (sub === 'info') return this.info(msg, args[1]);
    if (sub === 'buy') return this.buy(msg, args[1], args[2], args[3]);
    if (sub === 'sell') return this.sell(msg, args[1], args[2]);

    await msg.reply(
      'Użycie: `.city` / `.city info <id>` / `.city buy <city> <item> [qty]` / `.city sell <item> [qty]`.',
    );
  }

  private async list(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    const lines: string[] = [
      '🏛️ **Miasta:**',
      `_Twoje złoto:_ 💰 **${player.gold}**`,
      '',
    ];
    for (const c of listCities().sort((a, b) => a.region - b.region)) {
      const minLvl = REGION_LVL_REQ[c.region];
      const accessible = player.skills.combat.level >= minLvl;
      const lock = accessible ? '' : ` 🔒 (wymaga combat lvl ${minLvl})`;
      lines.push(`• \`${c.id}\` — **${c.name}** (Region ${c.region})${lock} — ${c.description}`);
    }
    lines.push(
      '',
      'Użycie: `.city info <id>` żeby zobaczyć handlarzy. `.city buy <city> <item> [qty]` / `.city sell <item> [qty]`.',
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
      `Kup: \`.city buy ${city.id} <item_id> [qty]\` · Sprzedaj: \`.city sell <item_id> [qty]\`.`,
    );
    await msg.reply(lines.join('\n').slice(0, 1900));
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
    const merchantWithStock = city.merchants.find((m) =>
      m.stock.some((s) => s.itemId === itemId),
    );
    if (!merchantWithStock) {
      await msg.reply(`W **${city.name}** nikt nie sprzedaje \`${itemId}\`.`);
      return;
    }
    const stockEntry = merchantWithStock.stock.find((s) => s.itemId === itemId)!;
    const qty = Math.max(1, parseInt(qtyArg ?? '1', 10) || 1);
    const totalCost = stockEntry.buyPrice * qty;
    if (!this.stats.hasGold(player, totalCost)) {
      await msg.reply(
        `Brakuje złota: potrzebujesz **${totalCost}**, masz **${player.gold}**.`,
      );
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
      await msg.reply('Użycie: `.city sell <item_id> [qty]` (sprzedaż w aktualnie odwiedzanym mieście — wybierane automatycznie po najwyższej cenie skupu).');
      return;
    }
    const player = this.stats.get(msg.author.id, displayName(msg));
    const have = player.inventory.resources[itemId] ?? 0;
    if (have <= 0) {
      await msg.reply(`Nie masz \`${itemId}\` w plecaku.`);
      return;
    }
    const qty = Math.max(1, Math.min(have, parseInt(qtyArg ?? `${have}`, 10) || have));

    // Znajdź najlepszą ofertę spośród miast dostępnych dla gracza (combat lvl).
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
