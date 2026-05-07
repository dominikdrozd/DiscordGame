import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { RACES, getRace, listRaces, fmtRaceStats } from '../races/index.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';
import { chat } from '../../../managers/chat.manager.js';

export class RaceCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'race';
  readonly prefix = '.race';
  readonly description =
    'Rasy. `.race` lista; `.race info/pick/reset <id>`. Slash: `/race list|info|pick|reset`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('race')
    .setDescription('Wybierz rasę i sprawdź dostępne rasy')
    .addSubcommand((sc) => sc.setName('list').setDescription('Lista wszystkich ras'))
    .addSubcommand((sc) =>
      sc
        .setName('info')
        .setDescription('Szczegóły rasy')
        .addStringOption((o) =>
          o.setName('id').setDescription('id rasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('pick')
        .setDescription('Wybierz rasę (jednorazowy)')
        .addStringOption((o) =>
          o.setName('id').setDescription('id rasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) => sc.setName('reset').setDescription('Cofnij wybór rasy'))
    .toJSON();

  constructor(private readonly stats: PlayerStatsService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? 'list';
    const player = this.stats.get(msg.author.id, displayName(msg));
    let result: string;
    if (!sub || sub === 'list') {
      result = this.renderList(player);
    } else if (sub === 'info') {
      result = this.renderInfo(args[1] ?? '');
    } else if (sub === 'pick') {
      result = this.tryPick(player, args[1] ?? '');
    } else if (sub === 'reset') {
      result = this.tryReset(player);
    } else {
      result = 'Użycie: `.race` / `.race info <id>` / `.race pick <id>` / `.race reset`.';
    }
    await chat.replyToMessage(msg, result);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'id') return;
    const q = focused.value.toLowerCase();
    const choices = listRaces()
      .filter((r) => r.id.includes(q) || r.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((r) => ({ name: `${r.name} (${r.id})`.slice(0, 100), value: r.id }));
    await interaction.respond(choices).catch(() => {});
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const sub = interaction.options.getSubcommand();
    let content: string;
    if (sub === 'list') {
      content = this.renderList(player);
    } else if (sub === 'info') {
      content = this.renderInfo(interaction.options.getString('id', true));
    } else if (sub === 'pick') {
      content = this.tryPick(player, interaction.options.getString('id', true));
    } else {
      content = this.tryReset(player);
    }
    await chat.reply(interaction, content, { ephemeral: true });
  }

  private renderList(player: PlayerStats): string {
    const lines = ['🧬 **Rasy:**'];
    for (const r of listRaces()) {
      lines.push(`• \`${r.id}\` — **${r.name}** (${fmtRaceStats(r)}) — ${r.description}`);
    }
    const current = player.raceId
      ? `Obecnie: **${RACES[player.raceId]?.name ?? player.raceId}**`
      : 'Nie masz wybranej rasy.';
    lines.push('', current, 'Użycie: `/race info` / `/race pick` lub `.race ...`.');
    return lines.join('\n').slice(0, 1900);
  }

  private renderInfo(id: string): string {
    const race = getRace(id);
    if (!race) return `Nie ma rasy \`${id}\`. Wpisz \`.race\` żeby zobaczyć listę.`;
    return `🧬 **${race.name}** (\`${race.id}\`)\n${race.description}\n*Startowe staty:* ${fmtRaceStats(race)}`;
  }

  private tryPick(player: PlayerStats, id: string): string {
    const race = getRace(id);
    if (!race) return `Nie ma rasy \`${id}\`. Wpisz \`.race\` żeby zobaczyć listę.`;
    const result = this.stats.applyRace(player, race.id, race.startingStats);
    if (!result.ok) return result.reason ?? 'Nie udało się wybrać rasy.';
    this.stats.save();
    return `✅ Witaj, **${race.name}**! Otrzymujesz: ${fmtRaceStats(race)}.`;
  }

  private tryReset(player: PlayerStats): string {
    if (!player.raceId) return 'Nie masz wybranej rasy — nie ma czego resetować.';
    const race = getRace(player.raceId);
    if (!race) return `Nie znaleziono definicji rasy \`${player.raceId}\`.`;
    this.stats.resetRace(player, race.startingStats);
    this.stats.save();
    return `🔄 Zresetowano rasę **${race.name}**. Cofnięto: ${fmtRaceStats(race)}. Wybierz nową przez \`/race pick\`.`;
  }
}
