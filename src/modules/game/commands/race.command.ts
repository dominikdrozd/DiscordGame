import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { RACES, getRace, listRaces, fmtRaceStats } from '../races/index.js';
import { displayName } from '../../../utils.js';

export class RaceCommand implements ICommand {
  readonly name = 'race';
  readonly prefix = '.race';
  readonly description =
    'Rasy. `.race` lista; `.race info <id>` opis; `.race pick <id>` wybór; `.race reset` cofa wybór (zwraca primary).';
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
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? '';

    if (!sub) {
      const lines = ['🧬 **Rasy:**'];
      for (const r of listRaces()) {
        lines.push(`• \`${r.id}\` — **${r.name}** (${fmtRaceStats(r)}) — ${r.description}`);
      }
      const player = this.stats.get(msg.author.id, displayName(msg));
      const current = player.raceId
        ? `Obecnie: **${RACES[player.raceId]?.name ?? player.raceId}**`
        : 'Nie masz wybranej rasy.';
      lines.push('', current, 'Użycie: `.race info <id>` / `.race pick <id>`.');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    if (sub === 'info') {
      const id = args[1];
      const race = id ? getRace(id) : undefined;
      if (!race) {
        await msg.reply(`Nie ma rasy \`${id ?? ''}\`. Wpisz \`.race\` żeby zobaczyć listę.`);
        return;
      }
      await msg.reply(
        `🧬 **${race.name}** (\`${race.id}\`)\n${race.description}\n*Startowe staty:* ${fmtRaceStats(race)}`,
      );
      return;
    }

    if (sub === 'pick') {
      const id = args[1];
      const race = id ? getRace(id) : undefined;
      if (!race) {
        await msg.reply(`Nie ma rasy \`${id ?? ''}\`. Wpisz \`.race\` żeby zobaczyć listę.`);
        return;
      }
      const player = this.stats.get(msg.author.id, displayName(msg));
      const result = this.stats.applyRace(player, race.id, race.startingStats);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wybrać rasy.');
        return;
      }
      this.stats.save();
      await msg.reply(`✅ Witaj, **${race.name}**! Otrzymujesz: ${fmtRaceStats(race)}.`);
      return;
    }

    if (sub === 'reset') {
      const player = this.stats.get(msg.author.id, displayName(msg));
      if (!player.raceId) {
        await msg.reply('Nie masz wybranej rasy — nie ma czego resetować.');
        return;
      }
      const race = getRace(player.raceId);
      if (!race) {
        await msg.reply(`Nie znaleziono definicji rasy \`${player.raceId}\`.`);
        return;
      }
      this.stats.resetRace(player, race.startingStats);
      this.stats.save();
      await msg.reply(
        `🔄 Zresetowano rasę **${race.name}**. Cofnięto: ${fmtRaceStats(race)}. Wybierz nową przez \`.race pick <id>\`.`,
      );
      return;
    }

    await msg.reply('Użycie: `.race` / `.race info <id>` / `.race pick <id>` / `.race reset`.');
  }
}
