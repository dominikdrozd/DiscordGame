import type { ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { DungeonService } from '../services/dungeon.service.js';

export class DungeonCommand implements ICommand {
  readonly name = 'dungeon';
  readonly prefix = '.dungeon';
  readonly description =
    'Multi-encounter dungeon. `.dungeon` pokazuje listę; `.dungeon <id>` rozpoczyna serię walk w wątku. Cooldown 30 min.';
  readonly requiresPrompt = false;

  constructor(private readonly dungeons: DungeonService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.dungeons.start(ctx);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.dungeons.handleInteraction(interaction);
  }
}
