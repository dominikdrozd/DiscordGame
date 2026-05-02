import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from '../services/player-stats.js';
import {
  CLASSES,
  SUBCLASS_UNLOCK_LEVEL,
  SUBCLASS2_UNLOCK_LEVEL,
  getClass,
  listClasses,
  findSubclass,
  findSubclass2,
  fmtPrimary,
} from '../classes/index.js';
import { displayName } from '../../../utils.js';

export class ClassCommand implements ICommand {
  readonly name = 'class';
  readonly prefix = '.class';
  readonly description =
    'Klasy. `.class` lista; `.class info <id>` opis; `.class pick <id>` wybór klasy; `.class subclass <id>` wybór subklasy (od combat lvl 20); `.class subclass2 <id>` tier-2 (od lvl 40); `.class reset` cofa wszystko.';
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
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!sub) {
      const lines = ['🛡️ **Klasy:**'];
      for (const c of listClasses()) {
        lines.push(`• \`${c.id}\` — **${c.name}** (${c.role}) — ${c.description} _bonus: ${fmtPrimary(c.primaryBonus)}_`);
      }
      const cur = player.classId
        ? `Obecnie: **${CLASSES[player.classId]?.name ?? player.classId}**` +
          (player.subclassId ? ` / ${player.subclassId}` : '')
        : 'Nie masz wybranej klasy.';
      lines.push('', cur, 'Użycie: `.class info <id>` / `.class pick <id>` / `.class subclass <id>`.');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    if (sub === 'info') {
      const id = args[1];
      const cls = id ? getClass(id) : undefined;
      if (!cls) {
        await msg.reply(`Nie ma klasy \`${id ?? ''}\`. Wpisz \`.class\` żeby zobaczyć listę.`);
        return;
      }
      const lines = [
        `🛡️ **${cls.name}** (\`${cls.id}\`) — ${cls.role}`,
        cls.description,
        `*Bonus primary:* ${fmtPrimary(cls.primaryBonus)}`,
        `*Skille startowe:* ${cls.startingSkills.join(', ')}`,
        '',
        '**Subklasy** (unlock @ combat lvl ' + SUBCLASS_UNLOCK_LEVEL + '):',
      ];
      for (const s of cls.subclasses) {
        lines.push(`• \`${s.id}\` — **${s.name}** — ${s.description} _bonus: ${fmtPrimary(s.primaryBonus)}_`);
        if (s.subclasses2 && s.subclasses2.length > 0) {
          for (const s2 of s.subclasses2) {
            lines.push(`   ↳ \`${s2.id}\` — **${s2.name}** (tier-2 @ lvl ${SUBCLASS2_UNLOCK_LEVEL}) — ${s2.description} _bonus: ${fmtPrimary(s2.primaryBonus)}_`);
          }
        }
      }
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    if (sub === 'pick') {
      const id = args[1];
      const cls = id ? getClass(id) : undefined;
      if (!cls) {
        await msg.reply(`Nie ma klasy \`${id ?? ''}\`.`);
        return;
      }
      const result = this.stats.applyClass(player, cls.id, cls.primaryBonus);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wybrać klasy.');
        return;
      }
      this.stats.save();
      await msg.reply(
        `✅ Witaj wśród **${cls.name}** (${cls.role}). Otrzymujesz: ${fmtPrimary(cls.primaryBonus)}, skille: ${cls.startingSkills.join(', ')}.`,
      );
      return;
    }

    if (sub === 'subclass') {
      const id = args[1];
      if (!player.classId) {
        await msg.reply('Najpierw wybierz klasę: `.class pick <id>`.');
        return;
      }
      const sc = id ? findSubclass(player.classId, id) : undefined;
      if (!sc) {
        const cls = CLASSES[player.classId];
        const opts = cls ? cls.subclasses.map((s) => s.id).join(', ') : '';
        await msg.reply(`Subklasa \`${id ?? ''}\` nie pasuje. Dostępne dla **${player.classId}**: ${opts}.`);
        return;
      }
      const result = this.stats.applySubclass(
        player,
        player.classId,
        sc.id,
        sc.primaryBonus,
        SUBCLASS_UNLOCK_LEVEL,
      );
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wybrać subklasy.');
        return;
      }
      this.stats.save();
      await msg.reply(
        `✅ Awansowałeś na **${sc.name}**! Otrzymujesz: ${fmtPrimary(sc.primaryBonus)}, dodatkowe skille: ${sc.bonusSkills.join(', ')}.`,
      );
      return;
    }

    if (sub === 'subclass2') {
      const id = args[1];
      if (!player.classId) {
        await msg.reply('Najpierw wybierz klasę: `.class pick <id>`.');
        return;
      }
      if (!player.subclassId) {
        await msg.reply('Najpierw wybierz tier-1 subklasę: `.class subclass <id>`.');
        return;
      }
      const sc2 = id ? findSubclass2(player.classId, player.subclassId, id) : undefined;
      if (!sc2) {
        const sub1 = findSubclass(player.classId, player.subclassId);
        const opts = sub1?.subclasses2?.map((s) => s.id).join(', ') ?? '';
        await msg.reply(`Tier-2 subklasa \`${id ?? ''}\` nie pasuje. Dostępne dla **${player.subclassId}**: ${opts || '(brak)'}.`);
        return;
      }
      const result = this.stats.applySubclass2(
        player,
        player.subclassId,
        sc2.id,
        sc2.primaryBonus,
        SUBCLASS2_UNLOCK_LEVEL,
      );
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wybrać tier-2 subklasy.');
        return;
      }
      this.stats.save();
      await msg.reply(
        `✅ Awansowałeś na **${sc2.name}**! Otrzymujesz: ${fmtPrimary(sc2.primaryBonus)}, dodatkowe skille: ${sc2.bonusSkills.join(', ')}.`,
      );
      return;
    }

    if (sub === 'reset') {
      if (!player.classId) {
        await msg.reply('Nie masz wybranej klasy — nie ma czego resetować.');
        return;
      }
      const cls = getClass(player.classId);
      if (!cls) {
        await msg.reply(`Nie znaleziono definicji klasy \`${player.classId}\`.`);
        return;
      }
      const sub1 = player.subclassId
        ? findSubclass(player.classId, player.subclassId)
        : undefined;
      const sub2 = player.subclass2Id && player.subclassId
        ? findSubclass2(player.classId, player.subclassId, player.subclass2Id)
        : undefined;
      this.stats.resetClass(player, cls.primaryBonus, sub1?.primaryBonus, sub2?.primaryBonus);
      this.stats.save();
      const parts = [`${fmtPrimary(cls.primaryBonus)} (klasa)`];
      if (sub1) parts.push(`${fmtPrimary(sub1.primaryBonus)} (subklasa **${sub1.name}**)`);
      if (sub2) parts.push(`${fmtPrimary(sub2.primaryBonus)} (tier-2 **${sub2.name}**)`);
      await msg.reply(
        `🔄 Zresetowano klasę **${cls.name}**. Cofnięto: ${parts.join(' + ')}. Wybierz nową przez \`.class pick <id>\`.`,
      );
      return;
    }

    await msg.reply('Użycie: `.class` / `.class info <id>` / `.class pick <id>` / `.class subclass <id>` / `.class subclass2 <id>` / `.class reset`.');
  }
}
