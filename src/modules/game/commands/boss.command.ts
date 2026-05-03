import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { BossService } from '../services/boss.service.js';
import { BaseCommand } from './base.command.js';

export class BossCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'boss';
  readonly prefix = '.boss';
  readonly description =
    'Walka z bossem PvE. `/boss` otwiera ephemeral browser; `.boss <id>` startuje walkę z czyatu. Cooldown 5 min.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Otwórz interaktywny browser bossów (ephemeral)')
    .toJSON();

  constructor(private readonly bosses: BossService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.bosses.start(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    return this.bosses.openFromSlash(interaction);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.bosses.handleInteraction(interaction);
  }
}
