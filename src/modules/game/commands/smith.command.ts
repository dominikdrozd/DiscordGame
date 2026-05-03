import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { SmithService } from '../services/smith.service.js';
import { listCities } from '../cities/index.js';
import { REGION_LVL_REQ } from '../engine/encounters.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { BaseCommand } from './base.command.js';

export class SmithCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'smith';
  readonly prefix = '.smith';
  readonly description =
    'Kowal w mieście — ulepsza broń/zbroję/narzędzia. `/smith city:<id>` lub w `/menu` → Miasta → 🔨 Kowal.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('smith')
    .setDescription('Otwórz kowala w wybranym mieście (ephemeral)')
    .addStringOption((o) =>
      o
        .setName('city')
        .setDescription('id miasta (kowal z wyższego miasta = wyższy cap upgradu)')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON();

  constructor(
    private readonly smith: SmithService,
    private readonly stats: PlayerStatsService,
  ) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    await msg.reply(
      'Kowal dostępny przez `/smith city:<id>` lub `/menu` → Miasta → wybierz miasto → 🔨 Kowal.',
    );
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const cityId = interaction.options.getString('city', true);
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const city = listCities().find((c) => c.id === cityId);
    if (!city) {
      await interaction
        .reply({ content: `Nieznane miasto \`${cityId}\`.`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const minLvl = REGION_LVL_REQ[city.region];
    if (player.skills.combat.level < minLvl) {
      await interaction
        .reply({
          content: `🚫 Miasto **${city.name}** wymaga combat lvl **${minLvl}**. Masz ${player.skills.combat.level}.`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    await this.smith.openFromSlash(interaction, cityId);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'city') return;
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const q = focused.value.toLowerCase();
    const choices = listCities()
      .filter((c) => c.id.includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((c) => {
        const cap = c.region * 3;
        const lockTag = player.skills.combat.level < REGION_LVL_REQ[c.region] ? ' 🔒' : '';
        return {
          name: `${c.name} (max +${cap})${lockTag}`.slice(0, 100),
          value: c.id,
        };
      });
    await interaction.respond(choices).catch(() => {});
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('smith:')) return;
    await this.smith.handleInteraction(interaction as ButtonInteraction);
  }
}
