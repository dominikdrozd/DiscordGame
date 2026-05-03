import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import {
  PlayerStatsService,
  type PlayerStats,
  type PrimaryAttribute,
} from '../services/player-stats.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

const VALID: readonly PrimaryAttribute[] = ['str', 'agi', 'wit', 'int'];

function isPrimaryAttribute(s: string): s is PrimaryAttribute {
  return s === 'str' || s === 'agi' || s === 'wit' || s === 'int';
}

export class SkillsCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'skills';
  readonly prefix = '.skills';
  readonly description =
    'Atrybuty primary. `.skills` pokazuje stan; `.skills add <str|agi|wit|int> <punkty>` rozdziela niewyłożone punkty.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('skills')
    .setDescription('Atrybuty primary — podgląd lub dodanie punktów')
    .addSubcommand((sc) => sc.setName('show').setDescription('Pokaż primary stats'))
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Dodaj punkty do primary stat')
        .addStringOption((o) =>
          o
            .setName('attr')
            .setDescription('Atrybut do podbicia')
            .setRequired(true)
            .addChoices(
              { name: 'STR (dmg + HP)', value: 'str' },
              { name: 'AGI (crit)', value: 'agi' },
              { name: 'WIT (def + HP)', value: 'wit' },
              { name: 'INT (spell power)', value: 'int' },
            ),
        )
        .addIntegerOption((o) =>
          o.setName('points').setDescription('Ile punktów wyłożyć').setRequired(true).setMinValue(1),
        ),
    )
    .toJSON();

  constructor(private readonly stats: PlayerStatsService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      await msg.reply(this.renderShow(player));
      return;
    }

    const parts = prompt.split(/\s+/);
    if (parts[0] !== 'add' || parts.length < 3) {
      await msg.reply('Użycie: `.skills add <str|agi|wit|int> <ile>`');
      return;
    }
    const attr = parts[1];
    const pts = parseInt(parts[2], 10);
    const result = this.tryAdd(player, attr, pts);
    await msg.reply(result);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const sub = interaction.options.getSubcommand();
    if (sub === 'show') {
      await interaction
        .reply({ content: this.renderShow(player), flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    if (sub === 'add') {
      const attr = interaction.options.getString('attr', true);
      const pts = interaction.options.getInteger('points', true);
      const result = this.tryAdd(player, attr, pts);
      await interaction
        .reply({ content: result, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }

  private renderShow(player: PlayerStats): string {
    return [
      `🎯 **Primary ${player.name}**`,
      `• STR: ${player.primary.str} (+${player.primary.str} dmg, +${player.primary.str * 5} HP)`,
      `• AGI: ${player.primary.agi} (+${player.primary.agi * 0.5}% crit)`,
      `• WIT: ${player.primary.wit} (+${player.primary.wit} def, +${player.primary.wit * 3} HP)`,
      `• INT: ${player.primary.int} (+${player.primary.int * 2} spell power)`,
      '',
      `Niewyłożone punkty: **${player.unspentPoints}**`,
      'Użycie: `/skills add` lub `.skills add <attr> <ile>`',
    ].join('\n');
  }

  private tryAdd(player: PlayerStats, attr: string, pts: number): string {
    if (!isPrimaryAttribute(attr)) return `Atrybut musi być jednym z: ${VALID.join(', ')}.`;
    if (!Number.isFinite(pts) || pts <= 0) return 'Liczba punktów musi być dodatnia.';
    const result = this.stats.spendPrimary(player, attr, pts);
    if (!result.ok) return result.reason ?? 'Nie udało się wyłożyć punktów.';
    this.stats.save();
    return `✅ +${pts} do **${attr.toUpperCase()}**. Pozostało punktów: **${player.unspentPoints}**.`;
  }
}
