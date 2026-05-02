import { type ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { CityService } from '../services/city.service.js';

export class CityCommand implements ICommand {
  readonly name = 'city';
  readonly prefix = '.city';
  readonly description =
    'Miasta i handel. `.city` lista; `.city info <id>` handlarze; `.city shop <id>` interaktywny sklep; `.city buy <city> <item> [qty]` kup; `.city sell <item> [qty]` sprzedaj.';
  readonly requiresPrompt = false;

  constructor(private readonly city: CityService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.city.handle(ctx);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.city.handleInteraction(interaction);
  }
}
