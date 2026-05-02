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
import { CraftService } from '../services/craft.service.js';

export class CraftCommand implements ICommand, ISlashCommand {
  readonly name = 'craft';
  readonly prefix = '.craft';
  readonly description = 'Crafting. `/craft` ephemeral browser; `.craft <recipeId>` szybki craft.';
  readonly requiresPrompt = false;

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Otwórz interaktywny browser craftingu (ephemeral)')
    .toJSON();

  constructor(private readonly crafting: CraftService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
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
