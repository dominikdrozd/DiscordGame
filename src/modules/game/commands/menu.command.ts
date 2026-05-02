import { type ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { MenuService } from '../services/menu.service.js';

export class MenuCommand implements ICommand {
  readonly name = 'menu';
  readonly prefix = '.menu';
  readonly description =
    'Główne menu gry. Buttony z szybkim podglądem stats/plecaka/skilli/party + listy wypraw/miast/craftów/bossów/dungeonów. Każde sub-view ma przycisk powrotu do menu.';
  readonly requiresPrompt = false;

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

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.menu.handleInteraction(interaction);
  }
}
