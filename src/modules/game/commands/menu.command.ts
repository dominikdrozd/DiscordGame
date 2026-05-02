import { SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { ICommand, ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { MenuService } from '../services/menu.service.js';

export class MenuCommand implements ICommand, ISlashCommand {
  readonly name = 'menu';
  readonly prefix = '.menu';
  readonly description =
    'Główne menu gry — ephemeral przez `/menu` lub publiczne przez `.menu`. Buttony z szybkim podglądem stats/plecaka/skilli/party + listy wypraw/miast/craftów/bossów/dungeonów.';
  readonly requiresPrompt = false;

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Otwórz menu gry (widoczne tylko dla ciebie)')
    .toJSON();

  constructor(private readonly menu: MenuService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.menu.handle(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    return this.menu.handleSlashCommand(interaction);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.menu.handleInteraction(interaction);
  }
}
