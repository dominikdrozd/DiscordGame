import type { ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { DuelService } from '../services/duel.service.js';

export class DuelCommand implements ICommand {
  readonly name = 'duel';
  readonly prefix = '.duel';
  readonly description =
    'Pojedynek PvP. Użycie: `.duel @przeciwnik`. Walka rundowa w wątku — w każdej rundzie obaj gracze wybierają akcję jednocześnie (atak/obrona/mikstura), potem akcje rozliczają się razem. Wygrana daje XP i poziomy.';

  constructor(private readonly duels: DuelService) {}

  matches(content: string): boolean {
    return content.startsWith(this.prefix + ' ') || content.trim() === this.prefix;
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.duels.start(ctx);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.duels.handleInteraction(interaction);
  }
}
