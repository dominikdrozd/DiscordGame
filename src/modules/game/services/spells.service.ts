import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  SKILLS,
  SUPER_SKILLS,
  skillsForClass,
  type Skill,
  type SkillRequirements,
  formatScaling,
} from '../skills/index.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { buildSpellsBrowseRows } from '../ui/spells-buttons.js';

type Tab = 'class' | 'super';

interface BrowserState {
  userId: string;
  index: number;
  tab: Tab;
  fromMenu: boolean;
}

/** Mapowanie super-spell ID → lista (bossId, chance%) — kto dropi tę księgę. */
function bossesDroppingBook(skillId: string): { name: string; chance: number }[] {
  const out: { name: string; chance: number }[] = [];
  for (const boss of Object.values(BOSS_MOBS)) {
    const drops = boss.rewards?.bookDrops ?? [];
    for (const d of drops) {
      if (d.skillId === skillId) {
        out.push({ name: boss.name, chance: Math.round(d.chance * 100) });
      }
    }
  }
  return out;
}

/** Wszystkie spelle dostępne dla klasy gracza (klasa + sub1 + sub2), bez super. */
function classSpellsFor(p: PlayerStats): Skill[] {
  const ids = new Set<string>();
  if (p.classId) {
    for (const s of skillsForClass(p.classId)) ids.add(s.id);
    if (p.subclassId) {
      for (const s of skillsForClass(p.subclassId)) ids.add(s.id);
      if (p.subclass2Id) {
        for (const s of skillsForClass(p.subclass2Id)) ids.add(s.id);
      }
    }
  }
  // sortowanie: po required level rosnąco, potem po nazwie
  return [...ids]
    .map((id) => SKILLS[id])
    .filter((s): s is Skill => !!s)
    .sort((a, b) => {
      const la = a.requirements?.level ?? 0;
      const lb = b.requirements?.level ?? 0;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });
}

function superSpellsList(): Skill[] {
  return Object.values(SUPER_SKILLS).sort((a, b) => {
    const la = a.requirements?.level ?? 0;
    const lb = b.requirements?.level ?? 0;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  });
}

function meetsRequirements(p: PlayerStats, req?: SkillRequirements): { ok: boolean; missing: string[] } {
  if (!req) return { ok: true, missing: [] };
  const missing: string[] = [];
  if (p.skills.combat.level < req.level) missing.push(`combat lvl ${req.level} (masz ${p.skills.combat.level})`);
  if (req.gold > 0 && p.gold < req.gold) missing.push(`${req.gold}g (masz ${p.gold})`);
  if (req.primary) {
    for (const [k, v] of Object.entries(req.primary)) {
      if (!v) continue;
      const have = p.primary[k as 'str' | 'agi' | 'wit' | 'int'];
      if (have < v) missing.push(`${k.toUpperCase()} ${v} (masz ${have})`);
    }
  }
  return { ok: missing.length === 0, missing };
}

function reqLine(req?: SkillRequirements): string {
  if (!req) return '_brak wymagań_';
  const parts: string[] = [`combat L${req.level}`];
  if (req.gold > 0) parts.push(`${req.gold}g`);
  if (req.primary) {
    for (const [k, v] of Object.entries(req.primary)) {
      if (v) parts.push(`${k.toUpperCase()} ${v}`);
    }
  }
  return parts.join(' · ');
}

export class SpellsService {
  private readonly browsers = new Map<string, BrowserState>();

  constructor(private readonly stats: PlayerStatsService) {}

  /** Wejście z `menu:spells` — interaction.update na ephemeral. */
  async openFromInteraction(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const state: BrowserState = { userId, index: 0, tab: 'class', fromMenu: true };
    this.browsers.set(userId, state);
    await this.renderBrowser(interaction, state);
  }

  /** Wejście z `/spells` — interaction.reply ephemeral. */
  async openFromSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    this.stats.get(userId, interaction.user.globalName || interaction.user.username);
    const state: BrowserState = { userId, index: 0, tab: 'class', fromMenu: false };
    this.browsers.set(userId, state);
    const list = this.spellsForTab(state);
    if (list.length === 0) {
      await interaction
        .reply({
          content: 'Najpierw wybierz klasę (`/class pick`) — wtedy zobaczysz dostępne spelle.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(userId);
    const skill = list[state.index];
    const canLearn = this.canLearnNow(player, skill);
    await interaction
      .reply({
        content: this.renderSpell(player, skill, state, list.length),
        components: buildSpellsBrowseRows(userId, list.length, canLearn, state.tab, false),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('spl:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój browser.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    let state = this.browsers.get(userId);
    if (!state) {
      state = { userId, index: 0, tab: 'class', fromMenu: false };
      this.browsers.set(userId, state);
    }
    if (action === 'close') {
      this.browsers.delete(userId);
      await interaction.update({ content: 'Browser spelli zamknięty.', components: [] }).catch(() => {});
      return;
    }
    if (action === 'tab') {
      state.tab = parts[3] === 'super' ? 'super' : 'class';
      state.index = 0;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'nav') {
      const dir = parts[3] === '-1' ? -1 : 1;
      const list = this.spellsForTab(state);
      if (list.length === 0) {
        await this.renderBrowser(interaction, state);
        return;
      }
      state.index = (state.index + dir + list.length) % list.length;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'learn') {
      const list = this.spellsForTab(state);
      if (list.length === 0) {
        await this.renderBrowser(interaction, state);
        return;
      }
      const skill = list[state.index];
      const result = this.learn(this.stats.get(userId), skill);
      this.stats.save();
      // re-render z efektem nauki (canLearn → false bo już wyuczony)
      await interaction
        .update({
          content: `${result}\n\n${this.renderSpell(this.stats.get(userId), skill, state, list.length)}`,
          components: buildSpellsBrowseRows(userId, list.length, false, state.tab, state.fromMenu),
        })
        .catch(() => {});
      return;
    }
  }

  /** Próba nauki skilla — sprawdza wymagania, gold, dla super-spelli też book. */
  learn(p: PlayerStats, skill: Skill): string {
    if (this.stats.hasLearnedSkill(p, skill.id)) {
      return `ℹ️ Już znasz **${skill.name}**.`;
    }
    if (skill.universal) {
      if (!this.stats.hasBook(p, skill.id)) {
        return `🔒 Nie masz księgi **${skill.name}** — zdobądź drop z bossa.`;
      }
    }
    const req = meetsRequirements(p, skill.requirements);
    if (!req.ok) {
      return `🚫 Brak wymagań do **${skill.name}**: ${req.missing.join(', ')}.`;
    }
    if (skill.requirements?.gold && skill.requirements.gold > 0) {
      if (!this.stats.removeGold(p, skill.requirements.gold)) {
        return `🚫 Brak złota — potrzeba ${skill.requirements.gold}g.`;
      }
    }
    this.stats.grantSkills(p, [skill.id]);
    if (skill.universal) this.stats.consumeBook(p, skill.id);
    return `✅ Wyuczyłeś **${skill.name}**!`;
  }

  private spellsForTab(state: BrowserState): Skill[] {
    const player = this.stats.get(state.userId);
    return state.tab === 'class' ? classSpellsFor(player) : superSpellsList();
  }

  private async renderBrowser(interaction: ButtonInteraction, state: BrowserState): Promise<void> {
    const list = this.spellsForTab(state);
    const player = this.stats.get(state.userId);
    if (list.length === 0) {
      const empty =
        state.tab === 'class'
          ? '_Nie masz klasy lub klasa nie ma spelli. Wybierz klasę przez `/class pick`._'
          : '_Brak super-spelli (??)._';
      await interaction
        .update({
          content: empty,
          components: buildSpellsBrowseRows(state.userId, 0, false, state.tab, state.fromMenu),
        })
        .catch(() => {});
      return;
    }
    if (state.index >= list.length) state.index = 0;
    const skill = list[state.index];
    const canLearn = this.canLearnNow(player, skill);
    await interaction
      .update({
        content: this.renderSpell(player, skill, state, list.length),
        components: buildSpellsBrowseRows(state.userId, list.length, canLearn, state.tab, state.fromMenu),
      })
      .catch(() => {});
  }

  /** Czy gracz może teraz wyuczyć — używane do enable/disable Naucz buttona. */
  private canLearnNow(p: PlayerStats, skill: Skill): boolean {
    if (this.stats.hasLearnedSkill(p, skill.id)) return false;
    if (skill.universal && !this.stats.hasBook(p, skill.id)) return false;
    return meetsRequirements(p, skill.requirements).ok;
  }

  private renderSpell(p: PlayerStats, skill: Skill, state: BrowserState, total: number): string {
    const isLearned = this.stats.hasLearnedSkill(p, skill.id);
    const hasBook = skill.universal && this.stats.hasBook(p, skill.id);
    const req = meetsRequirements(p, skill.requirements);

    let statusIcon: string;
    let statusLine: string;
    if (isLearned) {
      statusIcon = '✅';
      statusLine = '✅ **Wyuczony**';
    } else if (skill.universal && !hasBook) {
      statusIcon = '🔒';
      statusLine = '🔒 **Brak księgi** — drop z bossa';
    } else if (skill.universal && hasBook) {
      statusIcon = req.ok ? '📜' : '📜🔒';
      statusLine = req.ok
        ? '📜 **Masz księgę** — możesz wyuczyć'
        : `📜🔒 Masz księgę, ale brak wymagań: ${req.missing.join(', ')}`;
    } else {
      statusIcon = req.ok ? '💎' : '🔒';
      statusLine = req.ok
        ? '💎 **Możesz wyuczyć**'
        : `🔒 Brak wymagań: ${req.missing.join(', ')}`;
    }

    const tabLabel = state.tab === 'class' ? 'Klasowe' : 'Super';
    const lines: string[] = [
      `${statusIcon} **${skill.name}** _[${state.index + 1}/${total}, ${tabLabel}]_`,
      `_${skill.description}_`,
      '',
      statusLine,
      `🎯 Cel: **${skill.targeting}** · ⏱️ Cooldown: **${skill.cooldown}** tur`,
    ];
    const scaling = formatScaling(skill.scaling);
    if (scaling) lines.push(`📊 Skaluje: ${scaling}`);
    lines.push(`🎓 Wymagania: ${reqLine(skill.requirements)}`);
    if (skill.universal) {
      const drops = bossesDroppingBook(skill.id);
      if (drops.length > 0) {
        const formatted = drops.map((d) => `**${d.name}** (${d.chance}%)`).join(', ');
        lines.push(`📜 Drop księgi: ${formatted}`);
      }
    } else {
      // Pokaż które klasy mogą używać (subklasa = bardziej szczegółowe)
      const classNames = skill.classes
        .map((id) => CLASSES[id]?.name ?? findClassByAnySubId(id) ?? id)
        .join(', ');
      lines.push(`🛡️ Dostępne dla: ${classNames}`);
    }

    if (p.classId) {
      const cls = CLASSES[p.classId];
      const sub = p.subclassId ? findSubclass(p.classId, p.subclassId)?.name : undefined;
      const sub2 =
        p.subclassId && p.subclass2Id ? findSubclass2(p.classId, p.subclassId, p.subclass2Id)?.name : undefined;
      const path = `${cls?.name ?? p.classId}${sub ? ` / ${sub}` : ''}${sub2 ? ` / ${sub2}` : ''}`;
      lines.push('', `_(Twoja klasa: ${path} · combat L${p.skills.combat.level} · 💰 ${p.gold}g)_`);
    }
    return lines.join('\n').slice(0, 1900);
  }
}

/** Pomocnik — szuka czy `id` jest subclassem jakiejś klasy i zwraca nazwę. */
function findClassByAnySubId(id: string): string | undefined {
  for (const cls of Object.values(CLASSES)) {
    for (const sc of cls.subclasses) {
      if (sc.id === id) return sc.name;
      for (const sc2 of sc.subclasses2 ?? []) {
        if (sc2.id === id) return sc2.name;
      }
    }
  }
  return undefined;
}
