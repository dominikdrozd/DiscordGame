import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { fmtInstance } from '../services/items.js';
import { displayName } from '../../../utils.js';

export class EquipCommand implements ICommand {
  readonly name = 'equip';
  readonly prefix = '.equip';
  readonly description =
    'Zakłada przedmiot z plecaka w odpowiedni slot (broń/zbroja/narzędzie). Użycie: `.equip <uid>` (uid pokazuje `.inv`).';

  constructor(private readonly stats: PlayerStatsService) {}

  matches(content: string): boolean {
    return content.startsWith(this.prefix + ' ') || content.trim() === this.prefix;
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    const uid = prompt.trim();
    const result = this.stats.equip(player, uid);
    if (!result.ok || !result.item) {
      await msg.reply(result.reason ?? 'Nie udało się założyć itemu.');
      return;
    }
    this.stats.save();
    await msg.reply(`✅ Założone w slot **${result.item.slot}**: ${fmtInstance(result.item)}`);
  }
}
