import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService } from './party.js';
import { CITIES, getCity, listCities, type City } from '../cities/index.js';
import { EXPEDITIONS, REGION_LVL_REQ } from '../engine/encounters.js';
import { CLASSES, findSubclass, findSubclass2, listClasses, fmtPrimary } from '../classes/index.js';
import { RACES, listRaces, fmtRaceStats } from '../races/index.js';
import { fmtStats } from './items.js';
import { displayName } from '../../../utils.js';
import { buildMenuRows, buildBackToMenuRow } from '../ui/menu-buttons.js';
import { buildCityListRows, buildCityViewRows } from '../ui/city-buttons.js';
import { GatheringCommand } from '../commands/gathering.command.js';
import { DialogService } from './dialog.service.js';
import { ExpeditionService } from './expedition.service.js';
import { CraftService } from './craft.service.js';
import { BossService } from './boss.service.js';
import { SpellsService } from './spells.service.js';
import { SmithService } from './smith.service.js';
import { QuestCommand } from '../commands/quest.command.js';

export interface MenuGatherers {
  mine: GatheringCommand;
  fish: GatheringCommand;
  chop: GatheringCommand;
}

export interface MenuShopOpener {
  /**
   * Wywoływane gdy gracz kliknie 🛒 w widoku miasta. Implementacja w
   * `registerGameCommands` przepina rejestrację wątku do `CityCommand`,
   * żeby wątek miał poprawny TTL i routing wiadomości.
   */
  openShopFromInteraction(interaction: ButtonInteraction, cityId: string): Promise<void>;
}

export interface MenuInventoryOpener {
  /** Klik 🎒 Plecak w menu — adapter w `registerGameCommands` rejestruje wątek do `InventoryCommand`. */
  openInventoryFromInteraction(interaction: ButtonInteraction): Promise<void>;
}

const DUNGEONS_LIST = ['spizarnia_babci', 'smocza_dziupla'];

export class MenuService {
  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly gatherers: MenuGatherers,
    private readonly shop: MenuShopOpener,
    private readonly dialog: DialogService,
    private readonly expeditions: ExpeditionService,
    private readonly crafting: CraftService,
    private readonly bosses: BossService,
    private readonly inventory: MenuInventoryOpener,
    private readonly spells: SpellsService,
    private readonly smith: SmithService,
    private readonly questCommand: QuestCommand,
  ) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    await msg.reply({
      content: this.renderMain(player),
      components: buildMenuRows(player.id),
    });
  }

  /**
   * Slash command `/menu` — odpowiedź ephemeral, widoczne tylko dla użytkownika.
   * Click na buttony aktualizuje tę samą ephemeral wiadomość przez interaction.update.
   */
  async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    await interaction
      .reply({
        content: this.renderMain(player),
        components: buildMenuRows(player.id),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('menu:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    // userId zawsze na końcu — dla starych akcji index=2, dla city-* z parametrami index=3 lub 4
    const userId = parts[parts.length - 1];

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
    if (action === 'inv') return this.inventory.openInventoryFromInteraction(interaction);
    if (action === 'skills') return this.update(interaction, this.renderSkills(player), true);
    if (action === 'party') return this.update(interaction, this.renderParty(player), true);
    if (action === 'exp') return this.expeditions.openFromInteraction(interaction);
    if (action === 'city' || action === 'citylist') {
      if (player.activeExpedition) {
        return this.update(
          interaction,
          '🚫 Jesteś na wyprawie — nie możesz wejść do miasta. Wróć po `🎁 Zbierz` w `/menu` → 🗺️ Wyprawy.',
          true,
        );
      }
      return this.renderCityListView(interaction, player);
    }
    if (action === 'citypick') {
      const cityId = parts[2];
      return this.renderCityView(interaction, player, cityId);
    }
    if (action === 'cityshop') {
      const cityId = parts[2];
      return this.shop.openShopFromInteraction(interaction, cityId);
    }
    if (action === 'cityblacksmith') {
      const cityId = parts[2];
      return this.smith.openFromInteraction(interaction, cityId);
    }
    if (action === 'quests') {
      await interaction
        .update({
          content: this.questCommand.renderList(player),
          components: this.questCommand.buildRows(player),
        })
        .catch(() => {});
      return;
    }
    if (action === 'citytalk') {
      const npcId = parts[3];
      return this.dialog.startFromInteraction(interaction, npcId);
    }
    if (action === 'craft') return this.crafting.openFromInteraction(interaction);
    if (action === 'boss') {
      if (player.activeExpedition) {
        return this.update(
          interaction,
          '🚫 Jesteś na wyprawie — bossowie niedostępni. Dokończ wyprawę najpierw.',
          true,
        );
      }
      return this.bosses.openFromInteraction(interaction);
    }
    if (action === 'spells') return this.spells.openFromInteraction(interaction);
    if (action === 'dungeon') {
      if (player.activeExpedition) {
        return this.update(
          interaction,
          '🚫 Jesteś na wyprawie — dungeony niedostępne. Dokończ wyprawę najpierw.',
          true,
        );
      }
      return this.update(interaction, this.renderDungeonList(player), true);
    }
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
    const w = this.stats.equippedItem(p, 'weapon');
    const a = this.stats.equippedItem(p, 'armor');
    const t = this.stats.equippedItem(p, 'tool');
    const eqLine =
      [
        w ? `⚔️ ${w.name} (${fmtStats(w.stats)})` : '',
        a ? `🛡️ ${a.name} (${fmtStats(a.stats)})` : '',
        t ? `🔧 ${t.name} (${fmtStats(t.stats)})` : '',
      ]
        .filter(Boolean)
        .join(' · ') || '_(nic nie założone)_';
    return [
      `📊 **${p.name}** — pełen profil`,
      `🧬 Rasa: **${raceName}** · ⚔️ Klasa: **${classDisplay}**`,
      `📈 PvP L${p.level} · combat L${p.skills.combat.level} · 💰 ${p.gold} zł · 🏆 ${p.wins}W/${p.losses}L · 🎯 niewydane punkty: ${p.unspentPoints}`,
      '',
      '**Primary:**',
      `STR ${p.primary.str} · AGI ${p.primary.agi} · WIT ${p.primary.wit} · INT ${p.primary.int}`,
      '',
      '**Stats bojowe (z ekwipunkiem):**',
      `HP: **${this.stats.effectiveMaxHp(p)}** · Dmg: **+${this.stats.effectiveDamageBonus(p)}** · Def: **+${this.stats.effectiveDefenseBonus(p)}** · Crit: **${this.stats.effectiveCritPercent(p).toFixed(1)}%** · ⚡ Spd: **${this.stats.effectiveSpeed(p)}** · SP: **${this.stats.spellPower(p)}**`,
      `_(crit zawiera bazę 15% wspólną dla wszystkich + bonusy)_`,
      '',
      '**Założony ekwipunek:**',
      eqLine,
      '',
      '**Skille zawodowe:**',
      `⛏️ Mining L${p.skills.mining.level} · 🎣 Fishing L${p.skills.fishing.level} · 🪓 Wood L${p.skills.woodcutting.level} · 🛠️ Crafting L${p.skills.crafting.level} · ⚔️ Combat L${p.skills.combat.level}`,
    ].join('\n');
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

  private renderRace(p: PlayerStats): string {
    const lines: string[] = [`🧬 **Rasy** — twoja: **${p.raceId ? RACES[p.raceId]?.name ?? p.raceId : 'brak'}**`, ''];
    for (const r of listRaces()) {
      const tag = r.id === p.raceId ? ' ✅' : '';
      lines.push(`• \`${r.id}\` — **${r.name}**${tag} (${fmtRaceStats(r)})`);
      lines.push(`  _${r.description}_`);
    }
    lines.push('');
    if (!p.raceId) {
      lines.push('Wybór rasy odbywa się przez **dialog ze Starym Markiem** w Porcie Cykada — quest "Krew i Pochodzenie".');
    } else {
      lines.push('Wybór jest dożywotni — zmiana będzie możliwa w ostatnim mieście (przyszła feature).');
    }
    return lines.join('\n').slice(0, 1900);
  }

  private renderClass(p: PlayerStats): string {
    const cls = p.classId ? CLASSES[p.classId] : undefined;
    const sub1 = p.classId && p.subclassId ? findSubclass(p.classId, p.subclassId) : undefined;
    const sub2 =
      p.classId && p.subclassId && p.subclass2Id
        ? findSubclass2(p.classId, p.subclassId, p.subclass2Id)
        : undefined;
    const currentDisplay = cls
      ? `${cls.name}${sub1 ? ` / ${sub1.name}` : ''}${sub2 ? ` / ${sub2.name}` : ''}`
      : 'brak';
    const lines: string[] = [`⚔️ **Klasy** — twoja: **${currentDisplay}**`, ''];
    for (const c of listClasses()) {
      const tag = c.id === p.classId ? ' ✅' : '';
      lines.push(`• \`${c.id}\` — **${c.name}**${tag} (${c.role}) · base ⚡${c.baseSpeed}`);
      lines.push(`  _${c.description}_ — bonus: ${fmtPrimary(c.primaryBonus)}`);
    }
    lines.push('');
    if (!p.classId) {
      lines.push(
        'Wybór klasy odbywa się przez **dialog ze Starym Markiem** w Porcie Cykada — quest "Ścieżka Wojownika".',
      );
    } else {
      lines.push(
        `Combat L${p.skills.combat.level} — wybór jest dożywotni. Tier-1 subklasa od lvl 20, tier-2 od 40 (osobne UI w przyszłości).`,
      );
    }
    return lines.join('\n').slice(0, 1900);
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

  /**
   * Widok listy miast — buttony zamiast tekstowych ID. Każdy button reprezentuje
   * jedno miasto (disabled gdy combat lvl niewystarczający).
   */
  private async renderCityListView(
    interaction: ButtonInteraction,
    p: PlayerStats,
  ): Promise<void> {
    const cities = listCities().sort((a, b) => a.region - b.region);
    const isAccessible = (c: City): boolean => p.skills.combat.level >= REGION_LVL_REQ[c.region];
    const lines: string[] = [
      `🏛️ **Miasta** — twoje złoto: 💰 **${p.gold}** zł`,
      'Wybierz miasto guzikiem. Dostępne też: `.city info <id>` / `.city shop <id>` / `.talk <city> <npc>`.',
      '',
    ];
    for (const c of cities) {
      const accessible = isAccessible(c);
      const lock = accessible ? '' : ` 🔒 (combat ${REGION_LVL_REQ[c.region]}+)`;
      lines.push(
        `• **${c.name}** (R${c.region})${lock} — ${c.merchants.length} handlarzy, ${c.npcs.length} NPC`,
      );
    }
    const cityRows = buildCityListRows(cities, p.id, isAccessible);
    const backRow = buildBackToMenuRow(p.id);
    await interaction
      .update({ content: lines.join('\n').slice(0, 1900), components: [...cityRows, backRow] })
      .catch(() => {});
    void CITIES;
  }

  /**
   * Widok wybranego miasta — sklep + buttony per NPC + powrót do listy.
   * Jeśli combat lvl za niski → blokujemy z komunikatem.
   */
  private async renderCityView(
    interaction: ButtonInteraction,
    p: PlayerStats,
    cityId: string,
  ): Promise<void> {
    const city = getCity(cityId);
    if (!city) {
      await this.update(interaction, `Nie znam miasta \`${cityId}\`.`, true);
      return;
    }
    const minLvl = REGION_LVL_REQ[city.region];
    if (p.skills.combat.level < minLvl) {
      await this.update(
        interaction,
        `🚫 **${city.name}** wymaga combat lvl **${minLvl}**. Masz ${p.skills.combat.level}.`,
        true,
      );
      return;
    }
    const lines: string[] = [
      `🏛️ **${city.name}** (Region ${city.region})`,
      city.description,
      '',
      `💰 Twoje złoto: **${p.gold}** zł · Handlarzy: ${city.merchants.length} · NPC: ${city.npcs.length}`,
      '',
      'Klik **🛒 Sklep** otwiera prywatny wątek (jak `.city shop <id>`). Klik **💬 NPC** rozpoczyna rozmowę (jak `.talk ' +
        city.id +
        ' <npc>`).',
    ];
    const rows = buildCityViewRows(city.id, city.npcs, p.id);
    await interaction
      .update({ content: lines.join('\n').slice(0, 1900), components: rows })
      .catch(() => {});
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
