import { type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService } from './party.js';
import { CITIES, listCities } from '../cities/index.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { EXPEDITIONS, REGION_LVL_REQ, expeditionLvlBracket } from '../engine/encounters.js';
import { listRecipes } from './recipes.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';
import { RACES } from '../races/index.js';
import { fmtResource, fmtInstance } from './items.js';
import { displayName } from '../../../utils.js';
import { buildMenuRows, buildBackToMenuRow } from '../ui/menu-buttons.js';
import { GatheringCommand } from '../commands/gathering.command.js';

export interface MenuGatherers {
  mine: GatheringCommand;
  fish: GatheringCommand;
  chop: GatheringCommand;
}

const DUNGEONS_LIST = ['spizarnia_babci', 'smocza_dziupla'];

export class MenuService {
  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly gatherers: MenuGatherers,
  ) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    await msg.reply({
      content: this.renderMain(player),
      components: buildMenuRows(player.id),
    });
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('menu:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twoje menu.', ephemeral: true }).catch(() => {});
      return;
    }
    const player = this.stats.get(userId, interaction.user.globalName || interaction.user.username);

    if (action === 'close') {
      await interaction
        .update({ content: 'Menu zamknięte. `.menu` aby otworzyć ponownie.', components: [] })
        .catch(() => {});
      return;
    }
    if (action === 'back' || action === 'refresh') {
      await this.update(interaction, this.renderMain(player), false);
      return;
    }
    if (action === 'stats') return this.update(interaction, this.renderStats(player), true);
    if (action === 'inv') return this.update(interaction, this.renderInv(player), true);
    if (action === 'skills') return this.update(interaction, this.renderSkills(player), true);
    if (action === 'party') return this.update(interaction, this.renderParty(player), true);
    if (action === 'exp') return this.update(interaction, this.renderExpList(player), true);
    if (action === 'city') return this.update(interaction, this.renderCityList(player), true);
    if (action === 'craft') return this.update(interaction, this.renderCraftList(player), true);
    if (action === 'boss') return this.update(interaction, this.renderBossList(player), true);
    if (action === 'dungeon') return this.update(interaction, this.renderDungeonList(player), true);
    if (action === 'mine') return this.runGather(interaction, player, this.gatherers.mine);
    if (action === 'fish') return this.runGather(interaction, player, this.gatherers.fish);
    if (action === 'chop') return this.runGather(interaction, player, this.gatherers.chop);
  }

  private async runGather(
    interaction: ButtonInteraction,
    player: PlayerStats,
    cmd: GatheringCommand,
  ): Promise<void> {
    const result = cmd.runGather(player);
    await this.update(interaction, result, true);
  }

  private async update(
    interaction: ButtonInteraction,
    content: string,
    sub: boolean,
  ): Promise<void> {
    const userId = interaction.user.id;
    const components = sub ? [buildBackToMenuRow(userId)] : buildMenuRows(userId);
    await interaction.update({ content: content.slice(0, 1900), components }).catch(() => {});
  }

  // ── Renders ─────────────────────────────────────────

  private renderMain(p: PlayerStats): string {
    const raceName = p.raceId ? (RACES[p.raceId]?.name ?? p.raceId) : '—';
    const cls = p.classId ? CLASSES[p.classId] : undefined;
    const sub1 = p.classId && p.subclassId ? findSubclass(p.classId, p.subclassId) : undefined;
    const sub2 =
      p.classId && p.subclassId && p.subclass2Id
        ? findSubclass2(p.classId, p.subclassId, p.subclass2Id)
        : undefined;
    const classDisplay = cls
      ? `${cls.name}${sub1 ? ` / ${sub1.name}` : ''}${sub2 ? ` / ${sub2.name}` : ''}`
      : '—';
    return [
      `🎮 **Menu Quelthasee** — witaj, **${p.name}**`,
      `🧬 ${raceName} · ⚔️ ${classDisplay}`,
      `📈 PvP L${p.level} · combat L${p.skills.combat.level} · 💰 ${p.gold} zł · 🏆 ${p.wins}W/${p.losses}L`,
      p.activeExpedition
        ? `🗺️ _Aktywna ekspedycja: ${EXPEDITIONS[p.activeExpedition.destination]?.name ?? p.activeExpedition.destination}_`
        : '_Brak aktywnej ekspedycji._',
      '',
      'Wybierz akcję poniżej. Dla pełnej interaktywności (np. crafting browser, sklep) możesz też wpisać `.craft`, `.city shop <id>`, `.expedition` itd.',
    ].join('\n');
  }

  private renderStats(p: PlayerStats): string {
    const raceName = p.raceId ? (RACES[p.raceId]?.name ?? p.raceId) : '—';
    const cls = p.classId ? CLASSES[p.classId] : undefined;
    const sub1 = p.classId && p.subclassId ? findSubclass(p.classId, p.subclassId) : undefined;
    const sub2 =
      p.classId && p.subclassId && p.subclass2Id
        ? findSubclass2(p.classId, p.subclassId, p.subclass2Id)
        : undefined;
    const classDisplay = cls
      ? `${cls.name}${sub1 ? ` / ${sub1.name}` : ''}${sub2 ? ` / ${sub2.name}` : ''}`
      : '—';
    return [
      `📊 **${p.name}** — pełen profil`,
      `🧬 Rasa: **${raceName}** · ⚔️ Klasa: **${classDisplay}**`,
      `📈 PvP L${p.level} · combat L${p.skills.combat.level} · 💰 ${p.gold} zł · 🏆 ${p.wins}W/${p.losses}L · 🎯 niewydane punkty: ${p.unspentPoints}`,
      '',
      '**Primary:**',
      `STR ${p.primary.str} · AGI ${p.primary.agi} · WIT ${p.primary.wit} · INT ${p.primary.int}`,
      '',
      '**Stats bojowe:**',
      `HP: ${this.stats.hpFor(p)} · Dmg: +${this.stats.damageBonus(p)} · Def: +${this.stats.defenseBonus(p)} · Crit: +${this.stats.critBonus(p).toFixed(1)} · SP: ${this.stats.spellPower(p)}`,
      '',
      '**Skille zawodowe:**',
      `⛏️ Mining L${p.skills.mining.level} · 🎣 Fishing L${p.skills.fishing.level} · 🪓 Wood L${p.skills.woodcutting.level} · 🛠️ Crafting L${p.skills.crafting.level} · ⚔️ Combat L${p.skills.combat.level}`,
    ].join('\n');
  }

  private renderInv(p: PlayerStats): string {
    const lines: string[] = [`🎒 **Plecak ${p.name}**`, ''];
    lines.push('**Założone:**');
    for (const slot of ['weapon', 'armor', 'tool'] as const) {
      const it = this.stats.equippedItem(p, slot);
      lines.push(`• ${slot}: ${it ? fmtInstance(it) : '_pusty_'}`);
    }
    const resources = Object.entries(p.inventory.resources);
    if (resources.length) {
      lines.push('', '**Zasoby:**');
      for (const [id, qty] of resources) lines.push(`• ${fmtResource(id, qty)}`);
    }
    const items = p.inventory.items;
    if (items.length) {
      lines.push('', `**Itemy unikalne** (${items.length}):`);
      for (const it of items.slice(0, 15)) {
        const equipped = it.slot && p.equipped[it.slot] === it.uid ? ' **[założone]**' : '';
        lines.push(`• ${fmtInstance(it)}${equipped}`);
      }
      if (items.length > 15)
        lines.push(
          `_...i ${items.length - 15} więcej. Wpisz \`.inv\` aby zobaczyć wszystko z guzikami zakładania._`,
        );
    }
    if (resources.length === 0 && items.length === 0) {
      lines.push('', 'Plecak pusty. `.mine`, `.fish`, `.chop`.');
    }
    return lines.join('\n');
  }

  private renderSkills(p: PlayerStats): string {
    const xpForNext = (lvl: number): number => Math.floor(100 * Math.pow(lvl, 1.5));
    return [
      `✨ **Skille zawodowe ${p.name}**`,
      '',
      `⛏️ Mining L${p.skills.mining.level} (${p.skills.mining.xp}/${xpForNext(p.skills.mining.level)} XP)`,
      `🎣 Fishing L${p.skills.fishing.level} (${p.skills.fishing.xp}/${xpForNext(p.skills.fishing.level)} XP)`,
      `🪓 Woodcutting L${p.skills.woodcutting.level} (${p.skills.woodcutting.xp}/${xpForNext(p.skills.woodcutting.level)} XP)`,
      `🛠️ Crafting L${p.skills.crafting.level} (${p.skills.crafting.xp}/${xpForNext(p.skills.crafting.level)} XP)`,
      `⚔️ Combat L${p.skills.combat.level} (${p.skills.combat.xp}/${xpForNext(p.skills.combat.level)} XP)`,
      '',
      `🎯 Niewydane punkty primary: **${p.unspentPoints}**`,
      '_Punkty primary rozdzielisz przez `.skills add <str|agi|wit|int> <ile>`._',
    ].join('\n');
  }

  private renderParty(p: PlayerStats): string {
    const party = this.party.getByMember(p.id);
    if (!party) {
      return [
        '👥 **Party**',
        '',
        '_Nie jesteś w party._',
        'Stwórz: `.party create` · Zaproś: `.party invite @user`',
      ].join('\n');
    }
    const lines: string[] = [`👥 **Party** \`${party.id}\` (${party.members.length} osób)`];
    for (const memberId of party.members) {
      const member = this.stats.get(memberId);
      const tag = memberId === party.leaderId ? '👑' : '•';
      const display = member.name === member.id ? `<@${member.id}>` : member.name;
      lines.push(`${tag} ${display} — combat L${member.skills.combat.level}, ${member.gold} zł`);
    }
    if (party.pendingInvites.length) {
      lines.push('', '_Oczekujące zaproszenia:_');
      for (const inv of party.pendingInvites) lines.push(`• <@${inv}>`);
    }
    return lines.join('\n');
  }

  private renderExpList(p: PlayerStats): string {
    const lines: string[] = [
      '🗺️ **Wyprawy** (wpisz `.expedition` żeby otworzyć interaktywny browser)',
    ];
    if (p.activeExpedition) {
      const def = EXPEDITIONS[p.activeExpedition.destination];
      const left = p.activeExpedition.endsAt - Date.now();
      lines.push(
        '',
        `_Aktywna: **${def?.name ?? p.activeExpedition.destination}** — ${left <= 0 ? '✅ Skończona, kliknij Zbierz w `.expedition`' : `pozostało ${Math.ceil(left / 60_000)} min`}_`,
      );
    }
    const sorted = Object.values(EXPEDITIONS).sort((a, b) => {
      if (a.region !== b.region) return a.region - b.region;
      return a.tier - b.tier;
    });
    let region = 0;
    for (const e of sorted) {
      if (e.region !== region) {
        region = e.region;
        lines.push(
          '',
          `**Region ${e.region} — ${e.regionName}** (lvl ${REGION_LVL_REQ[e.region]}+)`,
        );
      }
      lines.push(`• \`${e.id}\` (T${e.tier}, lvl ${expeditionLvlBracket(e.tier)}) — ${e.name}`);
    }
    return lines.join('\n');
  }

  private renderCityList(p: PlayerStats): string {
    const lines: string[] = [
      `🏛️ **Miasta** — twoje złoto: 💰 **${p.gold}** zł`,
      '_Otwórz interaktywny sklep przez_ `.city shop <id>` _w prywatnym wątku._',
      '',
    ];
    for (const c of listCities().sort((a, b) => a.region - b.region)) {
      const minLvl = REGION_LVL_REQ[c.region];
      const lock = p.skills.combat.level < minLvl ? ` 🔒 (combat ${minLvl}+)` : '';
      lines.push(
        `• \`${c.id}\` — **${c.name}** (R${c.region})${lock} — ${c.merchants.length} handlarzy`,
      );
    }
    void CITIES;
    return lines.join('\n');
  }

  private renderCraftList(p: PlayerStats): string {
    const lines: string[] = [
      `🛠️ **Crafting** — twój level: **${p.skills.crafting.level}**`,
      '_Pełen interaktywny browser:_ `.craft`',
      '',
      '**Dostępne przepisy:**',
    ];
    for (const r of listRecipes()) {
      const lock = p.skills.crafting.level < r.craftingLevelRequired ? ' 🔒' : '';
      lines.push(`• \`${r.id}\` (lvl ${r.craftingLevelRequired})${lock}`);
    }
    return lines.join('\n');
  }

  private renderBossList(p: PlayerStats): string {
    const lines: string[] = ['👹 **Bossowie**', '_Wpisz_ `.boss <id>` _żeby zaatakować._', ''];
    const sorted = Object.values(BOSS_MOBS).sort((a, b) => a.tier - b.tier);
    for (const b of sorted) {
      const c = b.toCombatant();
      lines.push(`• \`${b.id}\` (T${b.tier}) — **${b.name}** (${c.hp} HP, +${c.damageBonus} dmg)`);
    }
    void p;
    return lines.join('\n');
  }

  private renderDungeonList(p: PlayerStats): string {
    void p;
    return [
      '🏰 **Dungeony**',
      '_Wpisz_ `.dungeon <id>` _żeby wejść._',
      '',
      ...DUNGEONS_LIST.map((id) => `• \`${id}\``),
    ].join('\n');
  }
}
