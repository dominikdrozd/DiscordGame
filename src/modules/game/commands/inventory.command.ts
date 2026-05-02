import type { ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { InventoryService } from '../services/inventory.service.js';

export class InventoryCommand implements ICommand {
  readonly name = 'inv';
  readonly prefix = '.inv';
  readonly description =
    'Pokazuje twój ekwipunek (zasoby + przedmioty) w DM-ie z togglem Załóż/Zdejmij dla każdego itemu.';
  readonly requiresPrompt = false;

  constructor(private readonly inventory: InventoryService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.inventory.show(ctx);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.inventory.handleInteraction(interaction);
  }
}
