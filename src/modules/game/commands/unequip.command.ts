import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { fmtInstance, type ItemSlot } from '../services/items.js';
import { displayName } from '../../../utils.js';

const VALID_SLOTS: ItemSlot[] = ['weapon', 'armor', 'tool'];

export class UnequipCommand implements ICommand {
  readonly name = 'unequip';
  readonly prefix = '.unequip';
  readonly description =
    'Zdejmuje przedmiot z wybranego slotu. Użycie: `.unequip <weapon|armor|tool>`.';

  constructor(private readonly stats: PlayerStatsService) {}

  matches(content: string): boolean {
    return content.startsWith(this.prefix + ' ') || content.trim() === this.prefix;
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const slot = prompt.trim().toLowerCase() as ItemSlot;
    if (!VALID_SLOTS.includes(slot)) {
      await msg.reply('Slot musi być jednym z: `weapon`, `armor`, `tool`.');
      return;
    }
    const player = this.stats.get(msg.author.id, displayName(msg));
    const removed = this.stats.unequip(player, slot);
    if (!removed) {
      await msg.reply(`Slot **${slot}** był pusty.`);
      return;
    }
    this.stats.save();
    await msg.reply(`✅ Zdjęte z **${slot}**: ${fmtInstance(removed)}`);
  }
}
