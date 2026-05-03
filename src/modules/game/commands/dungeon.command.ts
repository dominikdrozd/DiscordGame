import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { DungeonService } from '../services/dungeon.service.js';
import { DUNGEONS } from '../engine/encounters.js';
import { BaseCommand } from './base.command.js';

export class DungeonCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'dungeon';
  readonly prefix = '.dungeon';
  readonly description =
    'Multi-encounter dungeon. `/dungeon id:<id>` lub `.dungeon <id>`. Cooldown 30 min.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('dungeon')
    .setDescription('Wejdź do dungeona — seria walk w publicznym wątku')
    .addStringOption((o) =>
      o.setName('id').setDescription('id dungeona').setRequired(true).setAutocomplete(true),
    )
    .toJSON();

  constructor(private readonly dungeons: DungeonService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.dungeons.start(ctx);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'id') return;
    const q = focused.value.toLowerCase();
    const choices = Object.values(DUNGEONS)
      .filter((d) => d.id.includes(q) || d.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((d) => ({
        name: `${d.name} (${d.rooms.length} pokojów) — ${d.id}`.slice(0, 100),
        value: d.id,
      }));
    await interaction.respond(choices).catch(() => {});
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const id = interaction.options.getString('id', true);
    return this.dungeons.startFromSlash(interaction, id);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.dungeons.handleInteraction(interaction);
  }
}
