import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { ExpeditionService } from '../services/expedition.service.js';

export class ExpeditionCommand implements ICommand {
  readonly name = 'expedition';
  readonly prefix = '.expedition';
  readonly description =
    'Wyprawy czasowe. `.expedition` lista; `.expedition start <id>` rozpoczyna; `.expedition status` postęp; `.expedition claim` odbiera nagrody po zakończeniu.';
  readonly requiresPrompt = false;

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
}
