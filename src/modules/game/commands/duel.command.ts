import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommand,
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { DuelService } from '../services/duel.service.js';

export class DuelCommand implements ICommand, ISlashCommand {
  readonly name = 'duel';
  readonly prefix = '.duel';
  readonly description =
    'Pojedynek PvP. `/duel user:@przeciwnik` lub `.duel @user`. Walka rundowa w wątku.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Pojedynek PvP — walka rundowa w wątku')
    .addUserOption((o) =>
      o.setName('user').setDescription('Przeciwnik').setRequired(true),
    )
    .toJSON();

  constructor(private readonly duels: DuelService) {}

  matches(content: string): boolean {
    return content.startsWith(this.prefix + ' ') || content.trim() === this.prefix;
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.duels.start(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    return this.duels.startFromSlash(interaction);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.duels.handleInteraction(interaction);
  }
}
