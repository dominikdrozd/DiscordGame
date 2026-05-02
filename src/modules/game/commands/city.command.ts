import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommand,
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { CityService } from '../services/city.service.js';
import { CITIES, listCities } from '../cities/index.js';
import { ITEMS } from '../services/items.js';
import { PlayerStatsService } from '../services/player-stats.js';

export class CityCommand implements ICommand, ISlashCommand {
  readonly name = 'city';
  readonly prefix = '.city';
  readonly description =
    'Miasta i handel. `/city list|info|shop|buy|sell` lub `.city ...`.';
  readonly requiresPrompt = false;

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('city')
    .setDescription('Miasta i handel')
    .addSubcommand((sc) => sc.setName('list').setDescription('Lista miast'))
    .addSubcommand((sc) =>
      sc
        .setName('info')
        .setDescription('Szczegóły miasta + handlarze')
        .addStringOption((o) =>
          o.setName('city_id').setDescription('id miasta').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('shop')
        .setDescription('Otwórz interaktywny sklep w prywatnym wątku')
        .addStringOption((o) =>
          o.setName('city_id').setDescription('id miasta').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('buy')
        .setDescription('Kup surowiec od handlarza')
        .addStringOption((o) =>
          o.setName('city_id').setDescription('id miasta').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((o) =>
          o.setName('item_id').setDescription('id itemu').setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o.setName('qty').setDescription('Ile sztuk (domyślnie 1)').setRequired(false).setMinValue(1),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('sell')
        .setDescription('Sprzedaj surowiec (auto-wybór handlarza z najwyższym skupem)')
        .addStringOption((o) =>
          o.setName('item_id').setDescription('id itemu z plecaka').setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o.setName('qty').setDescription('Ile sztuk (domyślnie wszystkie)').setRequired(false).setMinValue(1),
        ),
    )
    .toJSON();

  constructor(
    private readonly city: CityService,
    private readonly stats: PlayerStatsService,
  ) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.city.handle(ctx);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    const q = focused.value.toLowerCase();
    if (focused.name === 'city_id') {
      const choices = listCities()
        .filter((c) => c.id.includes(q) || c.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((c) => ({ name: `${c.name} (${c.id})`.slice(0, 100), value: c.id }));
      await interaction.respond(choices).catch(() => {});
      return;
    }
    if (focused.name === 'item_id') {
      const sub = interaction.options.getSubcommand();
      const pool: { id: string; name: string }[] = [];
      if (sub === 'buy') {
        const cityId = interaction.options.getString('city_id');
        const city = cityId ? CITIES[cityId] : undefined;
        if (city) {
          for (const m of city.merchants) {
            for (const s of m.stock) {
              pool.push({ id: s.itemId, name: ITEMS[s.itemId]?.name ?? s.itemId });
            }
          }
        }
      } else if (sub === 'sell') {
        const player = this.stats.get(
          interaction.user.id,
          interaction.user.globalName || interaction.user.username,
        );
        for (const [id] of Object.entries(player.inventory.resources)) {
          pool.push({ id, name: ITEMS[id]?.name ?? id });
        }
      }
      const choices = pool
        .filter((p) => p.id.includes(q) || p.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((p) => ({ name: `${p.name} (${p.id})`.slice(0, 100), value: p.id }));
      await interaction.respond(choices).catch(() => {});
    }
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );

    if (sub === 'list') {
      await interaction
        .reply({ content: this.city.renderList(player), flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    if (sub === 'info') {
      const cityId = interaction.options.getString('city_id', true);
      await interaction
        .reply({ content: this.city.renderInfo(player, cityId), flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    if (sub === 'buy') {
      const cityId = interaction.options.getString('city_id', true);
      const itemId = interaction.options.getString('item_id', true);
      const qty = interaction.options.getInteger('qty') ?? 1;
      await interaction
        .reply({
          content: this.city.tryBuy(player, cityId, itemId, qty),
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    if (sub === 'sell') {
      const itemId = interaction.options.getString('item_id', true);
      const qty = interaction.options.getInteger('qty') ?? undefined;
      await interaction
        .reply({
          content: this.city.trySell(player, itemId, qty ?? undefined),
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    if (sub === 'shop') {
      const cityId = interaction.options.getString('city_id', true);
      const channel: unknown = interaction.channel;
      if (!hasThreadCreate(channel)) {
        await interaction
          .reply({
            content: 'Ten kanał nie wspiera prywatnych wątków.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      let openSucceeded = false;
      let errorMsg: string | undefined;
      await this.city.openShopForUser({
        cityId,
        userId: interaction.user.id,
        userName: interaction.user.globalName || interaction.user.username,
        channel,
        registerThread: () => {
          openSucceeded = true;
        },
        reply: async (content: string): Promise<unknown> => {
          errorMsg = content;
          return undefined;
        },
      });
      if (errorMsg && !openSucceeded) {
        await interaction.editReply({ content: errorMsg }).catch(() => {});
      } else {
        await interaction
          .editReply({ content: '🛒 Sklep otwarty w prywatnym wątku.' })
          .catch(() => {});
      }
      void ChannelType;
    }
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.city.handleInteraction(interaction);
  }
}

function hasThreadCreate(
  c: unknown,
): c is { threads: { create: (opts: unknown) => Promise<unknown> } } {
  if (!c || typeof c !== 'object') return false;
  if (!('threads' in c)) return false;
  const t = c.threads;
  if (!t || typeof t !== 'object') return false;
  if (!('create' in t)) return false;
  return typeof t.create === 'function';
}
