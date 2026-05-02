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
import { BossService } from '../services/boss.service.js';

export class BossCommand implements ICommand, ISlashCommand {
  readonly name = 'boss';
  readonly prefix = '.boss';
  readonly description =
    'Walka z bossem PvE. `/boss` otwiera ephemeral browser; `.boss <id>` startuje walkę z czyatu. Cooldown 5 min.';
  readonly requiresPrompt = false;

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Otwórz interaktywny browser bossów (ephemeral)')
    .toJSON();

  constructor(private readonly bosses: BossService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
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
