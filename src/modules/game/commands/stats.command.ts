import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { fmtInstance } from '../services/items.js';
import { RACES } from '../races/index.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';
import { displayName } from '../../../utils.js';

export class StatsCommand implements ICommand {
  readonly name = 'stats';
  readonly prefix = '.stats';
  readonly description =
    'Pokazuje profil gracza: poziom PvP, skille, atrybuty, ekwipunek, statystyki walki. Użycie: `.stats` lub `.stats @user`.';
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
    const { msg } = ctx;
    const target = msg.mentions?.users?.first() ?? msg.author;
    const name =
      target.id === msg.author.id ? displayName(msg) : target.globalName || target.username;
    const p = this.stats.get(target.id, name);

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
    lines.push('**Secondary (z itemów / legacy):**');
    lines.push(
      `• atak +${p.attribute.attack} · obrona +${p.attribute.defense} · hp +${p.attribute.hp * 5} · krit +${p.attribute.crit}%`,
    );
    lines.push(
      `• max HP w walce: **${this.stats.hpFor(p)}** · bonus dmg: **+${this.stats.damageBonus(p)}** · bonus def: **+${this.stats.defenseBonus(p)}** · crit: **${this.stats.critBonus(p)}%**`,
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

    await msg.reply(lines.join('\n').slice(0, 1900));
  }
}
