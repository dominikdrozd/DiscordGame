import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { CraftService } from '../services/craft.service.js';
import { BaseCommand } from './base.command.js';

export class CraftCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'craft';
  readonly prefix = '.craft';
  readonly description = 'Crafting. `/craft` ephemeral browser; `.craft <recipeId>` szybki craft.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Otwórz interaktywny browser craftingu (ephemeral)')
    .toJSON();

  constructor(private readonly crafting: CraftService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.crafting.handle(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    return this.crafting.openFromSlash(interaction);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.crafting.handleInteraction(interaction);
  }
}
