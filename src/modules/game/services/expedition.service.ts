import { type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService, type Party } from './party.js';
import {
  EXPEDITIONS,
  REGION_LVL_REQ,
  expeditionLvlBracket,
  expeditionMinLvl,
  type ExpeditionDef,
} from '../engine/encounters.js';
import { rollLootMany } from './loot.js';
import { rollItemInstance, fmtInstance, ITEMS } from './items.js';
import { displayName } from '../../../utils.js';
import { AMBUSH_MOB_CLASSES_BY_ID } from '../mobs/index.js';
import {
  buildExpBrowseRows,
  buildExpActiveRows,
  buildExpAfterRows,
} from '../ui/expedition-buttons.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';
import { RACES } from '../races/index.js';

const MAX_LOG_LINES = 25;

interface BrowserState {
  userId: string;
  index: number;
  channelId?: string;
  /** Czy view został otwarty z `menu:exp` — wtedy renderujemy ← Menu row. */
  fromMenu: boolean;
}

function sortedExpeditions(): ExpeditionDef[] {
  return Object.values(EXPEDITIONS).sort((a, b) => {
    if (a.region !== b.region) return a.region - b.region;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.name.localeCompare(b.name);
  });
}

export class ExpeditionService {
  private readonly browsers = new Map<string, BrowserState>();
  private readonly logs = new Map<string, string[]>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? '';

    if (!sub) return this.openInteractive(msg);
    if (sub === 'status') return this.status(msg);
    if (sub === 'claim') return this.claim(msg);
    if (sub === 'start') return this.start(msg, args[1]);
    await msg.reply(
      'Użycie: `.expedition` (interaktywny browser) / `.expedition start <id>` / `.expedition status` / `.expedition claim`.',
    );
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('exp:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    const arg = parts[3];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój browser.', ephemeral: true }).catch(() => {});
      return;
    }
    const player = this.stats.get(userId);

    if (action === 'nav') return this.handleNav(interaction, userId, arg);
    if (action === 'enter') return this.handleEnter(interaction, userId);
    if (action === 'refresh') return this.refreshActive(interaction, player);
    if (action === 'claim') return this.handleClaim(interaction, player);
    if (action === 'close') return this.handleClose(interaction, userId);
  }

  /** Wywoływane przez AmbushService po finish/timeout — dorzuca line do logu. */
  logAmbush(playerId: string, line: string): void {
    const existing = this.logs.get(playerId) ?? [];
    existing.push(line);
    if (existing.length > MAX_LOG_LINES) existing.shift();
    this.logs.set(playerId, existing);
  }

  // ── Interactive UI ──────────────────────────────────────

  private async openInteractive(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    if (player.activeExpedition) {
      await msg.reply({
        content: this.renderActiveContent(player),
        components: buildExpActiveRows(player.id, this.canClaim(player), false),
      });
      return;
    }
    const state: BrowserState = {
      userId: msg.author.id,
      index: 0,
      channelId: msg.channel?.id,
      fromMenu: false,
    };
    this.browsers.set(msg.author.id, state);
    const sorted = sortedExpeditions();
    const exp = sorted[state.index];
    await msg.reply({
      content: this.renderExpDetails(exp, player),
      components: buildExpBrowseRows(player.id, sorted.length, this.canEnter(exp, player), false),
    });
  }

  /**
   * Wejście do browsera ekspedycji z buttona menu (`menu:exp`).
   * Zamiast nowej wiadomości używa `interaction.update` (zachowuje pojedynczą
   * wiadomość menu) i dodaje row "← Menu" pod buttonami.
   */
  async openFromInteraction(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;
    const player = this.stats.get(userId, userName);
    // Zapisujemy state nawet w aktywnej ekspedycji, żeby kolejne refresh/claim
    // mogły odczytać `fromMenu` i zachować "← Menu" row.
    const state: BrowserState = {
      userId,
      index: 0,
      channelId: interaction.channel?.id,
      fromMenu: true,
    };
    this.browsers.set(userId, state);
    if (player.activeExpedition) {
      await interaction
        .update({
          content: this.renderActiveContent(player),
          components: buildExpActiveRows(player.id, this.canClaim(player), true),
        })
        .catch(() => {});
      return;
    }
    const sorted = sortedExpeditions();
    const exp = sorted[state.index];
    await interaction
      .update({
        content: this.renderExpDetails(exp, player),
        components: buildExpBrowseRows(player.id, sorted.length, this.canEnter(exp, player), true),
      })
      .catch(() => {});
  }

  private renderExpDetails(exp: ExpeditionDef, player: PlayerStats): string {
    const lvlBracket = expeditionLvlBracket(exp.tier);
    const regionMin = REGION_LVL_REQ[exp.region];
    const duration = Math.round(exp.durationMs / 60_000);
    const lines: string[] = [
      `🗺️ **${exp.name}** — _Region ${exp.region}: ${exp.regionName}_`,
      `Tier **${exp.tier}** · zalecany combat lvl **${lvlBracket}** (region wymaga ${regionMin}+)`,
      `Czas trwania: **${duration} min** · Twoje combat lvl: **${player.skills.combat.level}**`,
      '',
      exp.description,
      '',
      '**Możliwy loot:**',
    ];
    for (const entry of exp.lootTable) {
      const name = ITEMS[entry.itemId]?.name ?? entry.itemId;
      const qty =
        entry.qtyMin && entry.qtyMax && entry.qtyMin !== entry.qtyMax
          ? `${entry.qtyMin}-${entry.qtyMax}`
          : `${entry.qtyMin ?? 1}`;
      lines.push(`• ${name} ×${qty} (waga ${entry.weight})`);
    }
    if (exp.dropPool && exp.dropPool.length) {
      const drops = exp.dropPool.map((id) => ITEMS[id]?.name ?? id).join(', ');
      const chance = Math.round((exp.guaranteedDropChance ?? 0) * 100);
      lines.push(`• 🎁 Rzadki drop (${chance}% szans): ${drops}`);
    }
    lines.push('', '**Możliwe ambushy:**');
    const ambushIds = exp.ambushMobIds ?? Object.keys(AMBUSH_MOB_CLASSES_BY_ID);
    if (ambushIds.length === 0) {
      lines.push('_(spokojnie — brak agresywnych mobów)_');
    } else {
      for (const id of ambushIds) {
        const Ctor = AMBUSH_MOB_CLASSES_BY_ID[id];
        if (!Ctor) continue;
        const sample = new Ctor();
        lines.push(`• ${sample.name} (T${sample.tier}, ${sample.hp} HP base)`);
      }
    }
    if (exp.ambushTiers && exp.ambushTiers.length) {
      lines.push(`_Tiery ambush: ${exp.ambushTiers.join(', ')}_`);
    }

    const partyEntity = this.party.getByMember(player.id);
    if (partyEntity) {
      const isLeader = partyEntity.leaderId === player.id;
      lines.push(
        '',
        `**Wchodzisz z party** _(${partyEntity.members.length} os., ${isLeader ? 'jesteś liderem' : 'lider: <@' + partyEntity.leaderId + '>'}):_`,
      );
      for (const memberId of partyEntity.members) {
        const member = this.stats.get(memberId);
        const tag = memberId === partyEntity.leaderId ? '👑 ' : '• ';
        lines.push(`${tag}${this.fmtMember(member)}`);
      }
      if (!isLeader) {
        lines.push('_Tylko lider może rozpocząć wyprawę._');
      }
    } else {
      lines.push('', `**Wchodzisz solo:**`, `• ${this.fmtMember(player)}`);
    }

    lines.push('', `🎯 \`.expedition start ${exp.id}\` (lub kliknij **🗺️ Wejdź**)`);
    return lines.join('\n').slice(0, 1900);
  }

  private renderActiveContent(player: PlayerStats): string {
    if (!player.activeExpedition) return 'Nie masz aktywnej wyprawy.';
    const def = EXPEDITIONS[player.activeExpedition.destination];
    const left = player.activeExpedition.endsAt - Date.now();
    const lines: string[] = [
      `🗺️ **${def?.name ?? player.activeExpedition.destination}** — wyprawa w toku`,
    ];
    if (left <= 0) {
      lines.push('✅ **Skończona** — kliknij **🎁 Zbierz** żeby odebrać nagrody.');
    } else {
      lines.push(`⏳ Pozostało **${Math.ceil(left / 60_000)}** min.`);
    }

    lines.push('', ...this.renderPartySection(player));

    const log = this.logs.get(player.id) ?? [];
    if (log.length > 0) {
      lines.push('', '**Log walk:**');
      for (const line of log) lines.push(`• ${line}`);
    } else {
      lines.push('', '_(jeszcze brak ambushów na tej wyprawie)_');
    }
    return lines.join('\n').slice(0, 1900);
  }

  private renderPartySection(player: PlayerStats): string[] {
    const partyId = player.activeExpedition?.partyId;
    if (!partyId) {
      return ['**Wyprawa solo:**', `• ${this.fmtMember(player)}`];
    }
    const party = this.party.get(partyId);
    if (!party) {
      return [
        `**Party:** \`${partyId}\` (nie znaleziono w rejestrze)`,
        `• ${this.fmtMember(player)}`,
      ];
    }
    const leader = this.stats.get(party.leaderId);
    const leaderDisplay = leader.name === leader.id ? `<@${leader.id}>` : leader.name;
    const lines: string[] = [
      `**Party** _(lider: ${leaderDisplay}, ${party.members.length} osób):_`,
    ];
    for (const memberId of party.members) {
      const member = this.stats.get(memberId);
      const tag = memberId === party.leaderId ? '👑 ' : '• ';
      lines.push(`${tag}${this.fmtMember(member)}`);
    }
    return lines;
  }

  private fmtMember(p: PlayerStats): string {
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
    const hp = this.stats.hpFor(p);
    const dmg = this.stats.damageBonus(p);
    const def = this.stats.defenseBonus(p);
    const crit = this.stats.critBonus(p);
    const sp = this.stats.spellPower(p);
    // name === id znaczy że gracz nigdy nie wpisał komendy bota — pokaż mention,
    // żeby Discord renderował username zamiast surowego snowflake'a.
    const display = p.name === p.id ? `<@${p.id}>` : `**${p.name}**`;
    const weapon = this.stats.equippedItem(p, 'weapon');
    const armor = this.stats.equippedItem(p, 'armor');
    const tool = this.stats.equippedItem(p, 'tool');
    const eqParts: string[] = [];
    if (weapon) eqParts.push(`⚔️ ${weapon.name}`);
    if (armor) eqParts.push(`🛡️ ${armor.name}`);
    if (tool) eqParts.push(`🔧 ${tool.name}`);
    const eqLine = eqParts.length ? eqParts.join(' · ') : '_(brak ekwipunku)_';
    return [
      `${display} (combat L${p.skills.combat.level})`,
      `   • Rasa: ${raceName} · Klasa: ${classDisplay}`,
      `   • HP: ${hp} · Dmg: +${dmg} · Def: +${def} · Crit: +${crit.toFixed(1)} · SP: ${sp}`,
      `   • STR ${p.primary.str} · AGI ${p.primary.agi} · WIT ${p.primary.wit} · INT ${p.primary.int}`,
      `   • Eq: ${eqLine}`,
    ].join('\n');
  }

  private canEnter(exp: ExpeditionDef, player: PlayerStats): boolean {
    if (player.activeExpedition) return false;
    const regionMin = REGION_LVL_REQ[exp.region];
    if (player.skills.combat.level < regionMin) return false;
    const minLvl = expeditionMinLvl(exp.tier);
    if (player.skills.combat.level < minLvl) return false;
    return true;
  }

  private canClaim(player: PlayerStats): boolean {
    return !!player.activeExpedition && player.activeExpedition.endsAt <= Date.now();
  }

  private async handleNav(
    interaction: ButtonInteraction,
    userId: string,
    dirArg: string | undefined,
  ): Promise<void> {
    const player = this.stats.get(userId);
    if (player.activeExpedition) {
      await this.refreshActive(interaction, player);
      return;
    }
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Browser zamknięty — wpisz `.expedition` żeby otworzyć.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    const sorted = sortedExpeditions();
    const dir = dirArg === '-1' ? -1 : 1;
    state.index = (state.index + dir + sorted.length) % sorted.length;
    const exp = sorted[state.index];
    await interaction
      .update({
        content: this.renderExpDetails(exp, player),
        components: buildExpBrowseRows(
          userId,
          sorted.length,
          this.canEnter(exp, player),
          state.fromMenu,
        ),
      })
      .catch(() => {});
  }

  private async handleEnter(interaction: ButtonInteraction, userId: string): Promise<void> {
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction.reply({ content: 'Browser zamknięty.', ephemeral: true }).catch(() => {});
      return;
    }
    const sorted = sortedExpeditions();
    const exp = sorted[state.index];
    const player = this.stats.get(userId);
    const result = this.tryStartExpedition(player, exp, state.channelId);
    if (!result.ok) {
      await interaction
        .reply({ content: result.reason ?? 'Nie udało się.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const fromMenu = state.fromMenu;
    this.browsers.delete(userId);
    this.logs.set(userId, []);
    await interaction
      .update({
        content: `🗺️ **${exp.name}** rozpoczęta — wraca za ${Math.round(exp.durationMs / 60_000)} min. Wpisz \`.expedition\` żeby śledzić log walk.`,
        components: fromMenu ? buildExpAfterRows(userId) : [],
      })
      .catch(() => {});
  }

  private async refreshActive(interaction: ButtonInteraction, player: PlayerStats): Promise<void> {
    const fromMenu = this.browsers.get(player.id)?.fromMenu ?? false;
    if (!player.activeExpedition) {
      await interaction
        .update({
          content: 'Nie masz aktywnej wyprawy. Wpisz `.expedition` żeby otworzyć browser.',
          components: fromMenu ? buildExpAfterRows(player.id) : [],
        })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: this.renderActiveContent(player),
        components: buildExpActiveRows(player.id, this.canClaim(player), fromMenu),
      })
      .catch(() => {});
  }

  private async handleClaim(interaction: ButtonInteraction, player: PlayerStats): Promise<void> {
    if (!player.activeExpedition || player.activeExpedition.endsAt > Date.now()) {
      await interaction
        .reply({ content: 'Wyprawa jeszcze trwa lub nie istnieje.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const fromMenu = this.browsers.get(player.id)?.fromMenu ?? false;
    const summary = this.runClaim(player);
    this.logs.delete(player.id);
    this.browsers.delete(player.id);
    await interaction
      .update({
        content: summary,
        components: fromMenu ? buildExpAfterRows(player.id) : [],
      })
      .catch(() => {});
  }

  private async handleClose(interaction: ButtonInteraction, userId: string): Promise<void> {
    const fromMenu = this.browsers.get(userId)?.fromMenu ?? false;
    this.browsers.delete(userId);
    await interaction
      .update({
        content: 'Browser ekspedycji zamknięty.',
        components: fromMenu ? buildExpAfterRows(userId) : [],
      })
      .catch(() => {});
  }

  // ── Internal helpers ────────────────────────────────────

  private tryStartExpedition(
    leader: PlayerStats,
    def: ExpeditionDef,
    channelId: string | undefined,
  ): { ok: boolean; reason?: string } {
    const partyEntity = this.party.getByMember(leader.id);
    const isLeader = partyEntity?.leaderId === leader.id;
    if (partyEntity && !isLeader) {
      return { ok: false, reason: 'Wyprawę dla party może rozpocząć tylko lider.' };
    }
    const targets = partyEntity ? partyEntity.members : [leader.id];
    const regionMin = REGION_LVL_REQ[def.region];
    if (leader.skills.combat.level < regionMin) {
      return {
        ok: false,
        reason: `🚫 **Region ${def.region} (${def.regionName})** wymaga combat lvl **${regionMin}**. Masz ${leader.skills.combat.level}.`,
      };
    }
    const minLvl = expeditionMinLvl(def.tier);
    if (leader.skills.combat.level < minLvl) {
      return {
        ok: false,
        reason: `🚫 **${def.name}** wymaga combat lvl **${minLvl}** (T${def.tier}). Masz ${leader.skills.combat.level}.`,
      };
    }
    for (const id of targets) {
      const member = this.stats.get(id, id === leader.id ? leader.name : id);
      if (member.activeExpedition) {
        const left = member.activeExpedition.endsAt - Date.now();
        if (left > 0) {
          return {
            ok: false,
            reason: `<@${id}> ma wyprawę w toku (zostało ${Math.ceil(left / 60_000)} min).`,
          };
        }
        return {
          ok: false,
          reason: `<@${id}> ma niezebrane nagrody — niech użyje \`.expedition claim\`.`,
        };
      }
    }
    const endsAt = Date.now() + def.durationMs;
    for (const id of targets) {
      const member = this.stats.get(id, id === leader.id ? leader.name : id);
      member.activeExpedition = {
        destination: def.id,
        endsAt,
        channelId,
        partyId: partyEntity?.id,
      };
    }
    this.stats.save();
    return { ok: true };
  }

  private runClaim(player: PlayerStats): string {
    if (!player.activeExpedition) return 'Brak wyprawy.';
    const def = EXPEDITIONS[player.activeExpedition.destination];
    player.activeExpedition = null;
    if (!def) {
      this.stats.save();
      return 'Wyprawa zniknęła z konfiguracji — wyczyszczone.';
    }
    const drops = rollLootMany(def.lootTable, player.skills.combat.level, def.rolls);
    const labels: string[] = [];
    for (const d of drops) {
      this.stats.addResource(player, d.itemId, d.qty);
      labels.push(`${ITEMS[d.itemId]?.name ?? d.itemId} ×${d.qty}`);
    }
    const xpLeveled = this.stats.addXp(player, def.xp);
    const combatLeveled = def.combatXp
      ? this.stats.addSkillXp(player, 'combat', def.combatXp)
      : false;
    let dropLine = '';
    if (def.dropPool && def.dropPool.length && Math.random() < (def.guaranteedDropChance ?? 0)) {
      const baseId = def.dropPool[Math.floor(Math.random() * def.dropPool.length)];
      const item = rollItemInstance(baseId);
      if (item) {
        this.stats.addItem(player, item);
        dropLine = `\nZnaleziono: ${fmtInstance(item)} \`${item.uid}\``;
      }
    }
    this.stats.save();
    return [
      `🏁 **${def.name}** zakończona!`,
      `Loot: ${labels.length ? labels.join(', ') : '(nic)'}`,
      `+${def.xp} XP PvP${xpLeveled ? ' 🎉 LEVEL UP!' : ''}` +
        (def.combatXp ? `, +${def.combatXp} XP combat${combatLeveled ? ' 🎉 LEVEL UP!' : ''}` : ''),
      dropLine,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ── Stare komendy (back-compat) ────────────────────────

  private async status(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    if (!player.activeExpedition) {
      await msg.reply('Nie masz aktywnej wyprawy.');
      return;
    }
    const def = EXPEDITIONS[player.activeExpedition.destination];
    const left = player.activeExpedition.endsAt - Date.now();
    if (left <= 0) {
      await msg.reply(
        `✅ **${def?.name ?? player.activeExpedition.destination}** zakończona — odbierz \`.expedition claim\`.`,
      );
      return;
    }
    await msg.reply(
      `🗺️ **${def?.name ?? player.activeExpedition.destination}** trwa — koniec za ${Math.ceil(left / 60_000)} min.`,
    );
  }

  private async claim(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    if (!player.activeExpedition) {
      await msg.reply('Nie masz wyprawy do odebrania.');
      return;
    }
    if (player.activeExpedition.endsAt > Date.now()) {
      const left = player.activeExpedition.endsAt - Date.now();
      await msg.reply(`Wyprawa jeszcze trwa, zostało ${Math.ceil(left / 60_000)} min.`);
      return;
    }
    const summary = this.runClaim(player);
    this.logs.delete(player.id);
    await msg.reply(summary);
  }

  private async start(msg: any, destId: string | undefined): Promise<void> {
    if (!destId) {
      await msg.reply('Użycie: `.expedition start <id>`.');
      return;
    }
    const def = EXPEDITIONS[destId];
    if (!def) {
      await msg.reply(`Nie ma wyprawy \`${destId}\`. Zobacz \`.expedition\`.`);
      return;
    }
    const partyEntity = this.party.getByMember(msg.author.id);
    const isLeader = partyEntity?.leaderId === msg.author.id;
    if (partyEntity && !isLeader) {
      await msg.reply('Wyprawę dla party może rozpocząć tylko lider.');
      return;
    }
    const leader = this.stats.get(msg.author.id, displayName(msg));
    const result = this.tryStartExpedition(leader, def, msg.channel?.id);
    if (!result.ok) {
      await msg.reply(result.reason ?? 'Nie udało się rozpocząć.');
      return;
    }
    const targets = partyEntity ? partyEntity.members : [leader.id];
    this.logs.set(leader.id, []);
    if (partyEntity) {
      for (const id of partyEntity.members) this.logs.set(id, []);
    }
    const tag = partyEntity
      ? `dla party (${targets.map((id: string) => `<@${id}>`).join(', ')})`
      : '';
    await msg.reply(
      `🗺️ **${def.name}** rozpoczęta ${tag} — wraca za ${Math.round(def.durationMs / 60_000)} min. Wpisz \`.expedition\` żeby zobaczyć log walk.`,
    );
    void this.party as unknown as Party | undefined;
  }
}
