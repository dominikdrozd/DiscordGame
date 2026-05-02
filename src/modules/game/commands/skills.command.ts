import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PrimaryAttribute } from '../services/player-stats.js';
import { displayName } from '../../../utils.js';

const VALID: PrimaryAttribute[] = ['str', 'agi', 'wit', 'int'];

export class SkillsCommand implements ICommand {
  readonly name = 'skills';
  readonly prefix = '.skills';
  readonly description =
    'Atrybuty primary. `.skills` pokazuje stan; `.skills add <str|agi|wit|int> <punkty>` rozdziela niewyłożone punkty (1 punkt za każdy nowy lvl PvP).';
  readonly requiresPrompt = false;

  constructor(private readonly stats: PlayerStatsService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      await msg.reply(
        [
          `🎯 **Primary ${player.name}**`,
          `• STR: ${player.primary.str} (+${player.primary.str} dmg, +${player.primary.str * 5} HP)`,
          `• AGI: ${player.primary.agi} (+${player.primary.agi * 0.5}% crit)`,
          `• WIT: ${player.primary.wit} (+${player.primary.wit} def, +${player.primary.wit * 3} HP)`,
          `• INT: ${player.primary.int} (+${player.primary.int * 2} spell power)`,
          '',
          `Niewyłożone punkty: **${player.unspentPoints}**`,
          'Użycie: `.skills add <str|agi|wit|int> <ile>`',
        ].join('\n'),
      );
      return;
    }

    const parts = prompt.split(/\s+/);
    if (parts[0] !== 'add' || parts.length < 3) {
      await msg.reply('Użycie: `.skills add <str|agi|wit|int> <ile>`');
      return;
    }
    const attr = parts[1] as PrimaryAttribute;
    const pts = parseInt(parts[2], 10);
    if (!VALID.includes(attr)) {
      await msg.reply(`Atrybut musi być jednym z: ${VALID.join(', ')}.`);
      return;
    }
    if (!Number.isFinite(pts) || pts <= 0) {
      await msg.reply('Liczba punktów musi być dodatnia.');
      return;
    }

    const result = this.stats.spendPrimary(player, attr, pts);
    if (!result.ok) {
      await msg.reply(result.reason ?? 'Nie udało się wyłożyć punktów.');
      return;
    }
    this.stats.save();
    await msg.reply(
      `✅ +${pts} do **${attr.toUpperCase()}**. Pozostało punktów: **${player.unspentPoints}**.`,
    );
  }
}
