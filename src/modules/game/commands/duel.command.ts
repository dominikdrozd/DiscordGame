import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { DuelService } from '../services/duel.service.js';
import { BaseCommand } from './base.command.js';

export class DuelCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'duel';
  readonly prefix = '.duel';
  readonly description =
    'Pojedynek PvP. `/duel user:@przeciwnik` lub `.duel @user`. Walka rundowa w wątku.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Pojedynek PvP — walka rundowa w wątku')
    .addUserOption((o) => o.setName('user').setDescription('Przeciwnik').setRequired(true))
    .toJSON();

  constructor(private readonly duels: DuelService) {
    super();
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
