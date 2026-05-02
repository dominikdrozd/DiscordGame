import { type ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { CraftService } from '../services/craft.service.js';

export class CraftCommand implements ICommand {
  readonly name = 'craft';
  readonly prefix = '.craft';
  readonly description =
    'Crafting. `.craft` interaktywny browser z paginacją; `.craft <recipeId>` szybki craft konkretnego przepisu.';
  readonly requiresPrompt = false;

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

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.crafting.handleInteraction(interaction);
  }
}
