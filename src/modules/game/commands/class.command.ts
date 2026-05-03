import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
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
import { BaseCommand } from './base.command.js';

export class ClassCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'class';
  readonly prefix = '.class';
  readonly description =
    'Klasy. `.class` lista; `.class info/pick/subclass/subclass2/reset <id>`. Slash: `/class list|info|pick|subclass|subclass2|reset`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('class')
    .setDescription('Klasy: lista / info / pick / subclass / reset')
    .addSubcommand((sc) => sc.setName('list').setDescription('Lista klas'))
    .addSubcommand((sc) =>
      sc
        .setName('info')
        .setDescription('Szczegóły klasy + subklasy')
        .addStringOption((o) =>
          o.setName('id').setDescription('id klasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('pick')
        .setDescription('Wybierz klasę (jednorazowo)')
        .addStringOption((o) =>
          o.setName('id').setDescription('id klasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('subclass')
        .setDescription('Wybierz tier-1 subklasę (combat lvl 20+)')
        .addStringOption((o) =>
          o.setName('id').setDescription('id subklasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('subclass2')
        .setDescription('Wybierz tier-2 subklasę (combat lvl 40+)')
        .addStringOption((o) =>
          o.setName('id').setDescription('id tier-2 subklasy').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) => sc.setName('reset').setDescription('Cofnij wybór klasy/subklas'))
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
    if (!sub || sub === 'list') result = this.renderList(player);
    else if (sub === 'info') result = this.renderInfo(args[1] ?? '');
    else if (sub === 'pick') result = this.tryPick(player, args[1] ?? '');
    else if (sub === 'subclass') result = this.trySubclass(player, args[1] ?? '');
    else if (sub === 'subclass2') result = this.trySubclass2(player, args[1] ?? '');
    else if (sub === 'reset') result = this.tryReset(player);
    else result = 'Użycie: `.class` / `.class info|pick|subclass|subclass2|reset <id>`.';
    await msg.reply(result);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'id') return;
    const sub = interaction.options.getSubcommand();
    const q = focused.value.toLowerCase();
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    let pool: { id: string; name: string }[] = [];
    if (sub === 'info' || sub === 'pick') {
      pool = listClasses().map((c) => ({ id: c.id, name: c.name }));
    } else if (sub === 'subclass') {
      const cls = player.classId ? CLASSES[player.classId] : undefined;
      pool = cls ? cls.subclasses.map((s) => ({ id: s.id, name: s.name })) : [];
    } else if (sub === 'subclass2') {
      const sub1 =
        player.classId && player.subclassId
          ? findSubclass(player.classId, player.subclassId)
          : undefined;
      pool = sub1?.subclasses2?.map((s) => ({ id: s.id, name: s.name })) ?? [];
    }
    const choices = pool
      .filter((c) => c.id.includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((c) => ({ name: `${c.name} (${c.id})`.slice(0, 100), value: c.id }));
    await interaction.respond(choices).catch(() => {});
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const sub = interaction.options.getSubcommand();
    let content: string;
    if (sub === 'list') content = this.renderList(player);
    else if (sub === 'info') content = this.renderInfo(interaction.options.getString('id', true));
    else if (sub === 'pick') content = this.tryPick(player, interaction.options.getString('id', true));
    else if (sub === 'subclass')
      content = this.trySubclass(player, interaction.options.getString('id', true));
    else if (sub === 'subclass2')
      content = this.trySubclass2(player, interaction.options.getString('id', true));
    else content = this.tryReset(player);
    await interaction
      .reply({ content, flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  private renderList(player: PlayerStats): string {
    const lines = ['🛡️ **Klasy:**'];
    for (const c of listClasses()) {
      lines.push(
        `• \`${c.id}\` — **${c.name}** (${c.role}) — ${c.description} _bonus: ${fmtPrimary(c.primaryBonus)}_`,
      );
    }
    const cur = player.classId
      ? `Obecnie: **${CLASSES[player.classId]?.name ?? player.classId}**` +
        (player.subclassId ? ` / ${player.subclassId}` : '')
      : 'Nie masz wybranej klasy.';
    lines.push('', cur, 'Użycie: `/class info|pick|subclass|subclass2|reset` lub `.class ...`.');
    return lines.join('\n').slice(0, 1900);
  }

  private renderInfo(id: string): string {
    const cls = getClass(id);
    if (!cls) return `Nie ma klasy \`${id}\`. Wpisz \`.class\` żeby zobaczyć listę.`;
    const lines = [
      `🛡️ **${cls.name}** (\`${cls.id}\`) — ${cls.role}`,
      cls.description,
      `*Bonus primary:* ${fmtPrimary(cls.primaryBonus)} · *base ⚡speed:* ${cls.baseSpeed}`,
      `*Skille startowe:* ${cls.startingSkills.join(', ')}`,
      '',
      '**Subklasy** (unlock @ combat lvl ' + SUBCLASS_UNLOCK_LEVEL + '):',
    ];
    for (const s of cls.subclasses) {
      lines.push(
        `• \`${s.id}\` — **${s.name}** — ${s.description} _bonus: ${fmtPrimary(s.primaryBonus)}_`,
      );
      if (s.subclasses2 && s.subclasses2.length > 0) {
        for (const s2 of s.subclasses2) {
          lines.push(
            `   ↳ \`${s2.id}\` — **${s2.name}** (tier-2 @ lvl ${SUBCLASS2_UNLOCK_LEVEL}) — ${s2.description} _bonus: ${fmtPrimary(s2.primaryBonus)}_`,
          );
        }
      }
    }
    return lines.join('\n').slice(0, 1900);
  }

  private tryPick(player: PlayerStats, id: string): string {
    const cls = getClass(id);
    if (!cls) return `Nie ma klasy \`${id}\`.`;
    const result = this.stats.applyClass(player, cls.id, cls.primaryBonus, cls.startingSkills);
    if (!result.ok) return result.reason ?? 'Nie udało się wybrać klasy.';
    this.stats.save();
    return `✅ Witaj wśród **${cls.name}** (${cls.role}). Otrzymujesz: ${fmtPrimary(cls.primaryBonus)}, skille: ${cls.startingSkills.join(', ')}.`;
  }

  private trySubclass(player: PlayerStats, id: string): string {
    if (!player.classId) return 'Najpierw wybierz klasę: `/class pick`.';
    const sc = findSubclass(player.classId, id);
    if (!sc) {
      const cls = CLASSES[player.classId];
      const opts = cls ? cls.subclasses.map((s) => s.id).join(', ') : '';
      return `Subklasa \`${id}\` nie pasuje. Dostępne dla **${player.classId}**: ${opts}.`;
    }
    const result = this.stats.applySubclass(
      player,
      player.classId,
      sc.id,
      sc.primaryBonus,
      SUBCLASS_UNLOCK_LEVEL,
      sc.bonusSkills,
    );
    if (!result.ok) return result.reason ?? 'Nie udało się wybrać subklasy.';
    this.stats.save();
    return `✅ Awansowałeś na **${sc.name}**! Otrzymujesz: ${fmtPrimary(sc.primaryBonus)}, dodatkowe skille: ${sc.bonusSkills.join(', ')}.`;
  }

  private trySubclass2(player: PlayerStats, id: string): string {
    if (!player.classId) return 'Najpierw wybierz klasę: `/class pick`.';
    if (!player.subclassId) return 'Najpierw wybierz tier-1 subklasę: `/class subclass`.';
    const sc2 = findSubclass2(player.classId, player.subclassId, id);
    if (!sc2) {
      const sub1 = findSubclass(player.classId, player.subclassId);
      const opts = sub1?.subclasses2?.map((s) => s.id).join(', ') ?? '';
      return `Tier-2 subklasa \`${id}\` nie pasuje. Dostępne dla **${player.subclassId}**: ${opts || '(brak)'}.`;
    }
    const result = this.stats.applySubclass2(
      player,
      player.subclassId,
      sc2.id,
      sc2.primaryBonus,
      SUBCLASS2_UNLOCK_LEVEL,
      sc2.bonusSkills,
    );
    if (!result.ok) return result.reason ?? 'Nie udało się wybrać tier-2 subklasy.';
    this.stats.save();
    return `✅ Awansowałeś na **${sc2.name}**! Otrzymujesz: ${fmtPrimary(sc2.primaryBonus)}, dodatkowe skille: ${sc2.bonusSkills.join(', ')}.`;
  }

  private tryReset(player: PlayerStats): string {
    if (!player.classId) return 'Nie masz wybranej klasy — nie ma czego resetować.';
    const cls = getClass(player.classId);
    if (!cls) return `Nie znaleziono definicji klasy \`${player.classId}\`.`;
    const sub1 = player.subclassId ? findSubclass(player.classId, player.subclassId) : undefined;
    const sub2 =
      player.subclass2Id && player.subclassId
        ? findSubclass2(player.classId, player.subclassId, player.subclass2Id)
        : undefined;
    this.stats.resetClass(player, cls.primaryBonus, sub1?.primaryBonus, sub2?.primaryBonus);
    this.stats.save();
    const parts = [`${fmtPrimary(cls.primaryBonus)} (klasa)`];
    if (sub1) parts.push(`${fmtPrimary(sub1.primaryBonus)} (subklasa **${sub1.name}**)`);
    if (sub2) parts.push(`${fmtPrimary(sub2.primaryBonus)} (tier-2 **${sub2.name}**)`);
    return `🔄 Zresetowano klasę **${cls.name}**. Cofnięto: ${parts.join(' + ')}. Wybierz nową przez \`/class pick\`.`;
  }
}
