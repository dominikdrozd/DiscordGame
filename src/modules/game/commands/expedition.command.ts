import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { ExpeditionService } from '../services/expedition.service.js';
import { BaseCommand } from './base.command.js';

export class ExpeditionCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'expedition';
  readonly prefix = '.expedition';
  readonly description =
    'Wyprawy. `/expedition` browser ephemeral; `.expedition` browser publiczny; `.expedition start/claim/status` subkomendy.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('expedition')
    .setDescription('Otwórz browser wypraw (ephemeral) lub zarządzaj aktywną wyprawą')
    .toJSON();

  constructor(private readonly expeditions: ExpeditionService) {
    super();
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
