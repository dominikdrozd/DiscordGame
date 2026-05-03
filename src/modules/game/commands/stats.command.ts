import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { fmtInstance } from '../services/items.js';
import { RACES } from '../races/index.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

export class StatsCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'stats';
  readonly prefix = '.stats';
  readonly description =
    'Pokazuje profil gracza: poziom PvP, skille, atrybuty, ekwipunek, statystyki walki. Użycie: `.stats` lub `.stats @user` lub `/stats [user]`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Pokaż profil gracza (statystyki, skille, ekwipunek)')
    .addUserOption((o) =>
      o.setName('user').setDescription('Czyje stats pokazać (domyślnie twoje)').setRequired(false),
    )
    .toJSON();

  constructor(private readonly stats: PlayerStatsService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    const target = msg.mentions?.users?.first() ?? msg.author;
    const name =
      target.id === msg.author.id ? displayName(msg) : target.globalName || target.username;
    const p = this.stats.get(target.id, name);
    await msg.reply(this.renderProfile(p));
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const name =
      targetUser.id === interaction.user.id
        ? interaction.user.globalName || interaction.user.username
        : targetUser.globalName || targetUser.username;
    const p = this.stats.get(targetUser.id, name);
    await interaction
      .reply({ content: this.renderProfile(p), flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  private renderProfile(p: PlayerStats): string {
    const lines: string[] = [];
    const raceName = p.raceId ? (RACES[p.raceId]?.name ?? p.raceId) : '— (ustaw `.race pick <id>`)';
    const classObj = p.classId ? CLASSES[p.classId] : undefined;
    const sub2Name =
      p.subclass2Id && p.classId && p.subclassId
        ? (findSubclass2(p.classId, p.subclassId, p.subclass2Id)?.name ?? p.subclass2Id)
        : undefined;
    const classDisplay = classObj
      ? `${classObj.name}${p.subclassId ? ` / ${findSubclass(p.classId!, p.subclassId)?.name ?? p.subclassId}` : ''}${sub2Name ? ` / ${sub2Name}` : ''} (${classObj.role})`
      : '— (ustaw `.class pick <id>`)';
    lines.push(`📊 **${p.name}** · rasa: **${raceName}** · klasa: **${classDisplay}**`);
    lines.push(
      `PvP: lvl **${p.level}** · ${p.xp}/${this.stats.xpForNextLevel(p.level)} XP · ${p.wins}W/${p.losses}L (${p.duels} pojedynków) · niewyłożone punkty: **${p.unspentPoints}** · 💰 **${p.gold}** złota`,
    );
    lines.push('');
    lines.push('**Primary (STR/AGI/WIT/INT):**');
    lines.push(
      `• STR ${p.primary.str} · AGI ${p.primary.agi} · WIT ${p.primary.wit} · INT ${p.primary.int}`,
    );
    lines.push('**Secondary (z atrybutów):**');
    lines.push(
      `• atak +${p.attribute.attack} · obrona +${p.attribute.defense} · hp +${p.attribute.hp * 5} · krit +${p.attribute.crit}%`,
    );
    lines.push('**Stats efektywne (z primary + ekwipunek):**');
    lines.push(
      `• max HP: **${this.stats.effectiveMaxHp(p)}** · bonus dmg: **+${this.stats.effectiveDamageBonus(p)}** · bonus def: **+${this.stats.effectiveDefenseBonus(p)}** · crit: **${this.stats.effectiveCritPercent(p).toFixed(1)}%** _(baza 15% + bonusy)_ · ⚡ speed: **${this.stats.effectiveSpeed(p)}** _(AGI + ekwipunek)_ · SP: **${this.stats.spellPower(p)}**`,
    );
    lines.push('');
    lines.push('**Skille:**');
    for (const [k, v] of Object.entries(p.skills)) {
      lines.push(`• ${k}: lvl ${v.level} · ${v.xp}/${this.stats.xpForNextLevel(v.level)} XP`);
    }
    lines.push('');
    lines.push('**Ekwipunek:**');
    for (const slot of ['weapon', 'armor', 'tool'] as const) {
      const it = this.stats.equippedItem(p, slot);
      lines.push(`• ${slot}: ${it ? fmtInstance(it) : '_pusty_'}`);
    }

    if (p.activeExpedition) {
      const left = Math.max(0, p.activeExpedition.endsAt - Date.now());
      lines.push('');
      lines.push(
        `🗺️ **Wyprawa:** ${p.activeExpedition.destination} — ${left > 0 ? `kończy się za ${Math.ceil(left / 60_000)} min` : 'gotowa do odbioru (`.expedition claim`)'}`,
      );
    }

    return lines.join('\n').slice(0, 1900);
  }
}
