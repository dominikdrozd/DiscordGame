import type { ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { BossService } from '../services/boss.service.js';

export class BossCommand implements ICommand {
  readonly name = 'boss';
  readonly prefix = '.boss';
  readonly description =
    'Walka z bossem PvE w wątku. `.boss` pokazuje listę; `.boss <id>` rozpoczyna walkę. Cooldown 5 min między próbami.';
  readonly requiresPrompt = false;

  constructor(private readonly bosses: BossService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.bosses.start(ctx);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.bosses.handleInteraction(interaction);
  }
}
