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
import { ExpeditionService } from '../services/expedition.service.js';

export class ExpeditionCommand implements ICommand, ISlashCommand {
  readonly name = 'expedition';
  readonly prefix = '.expedition';
  readonly description =
    'Wyprawy. `/expedition` browser ephemeral; `.expedition` browser publiczny; `.expedition start/claim/status` subkomendy.';
  readonly requiresPrompt = false;

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('expedition')
    .setDescription('Otwórz browser wypraw (ephemeral) lub zarządzaj aktywną wyprawą')
    .toJSON();

  constructor(private readonly expeditions: ExpeditionService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.expeditions.handle(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    return this.expeditions.openFromSlash(interaction);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.expeditions.handleInteraction(interaction);
  }
}
