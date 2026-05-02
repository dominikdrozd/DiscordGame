import { type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService, type Party } from './party.js';
import { POTIONS_START } from '../engine/combat.js';
import {
  type BattleCombatant,
  type BattleState,
  aliveEnemies,
  findCombatant,
  humansAlive,
} from '../engine/battle-state.js';
import { resolveBattleRound } from '../engine/combat-battle.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import {
  openItemPicker,
  recordItemPick,
  syncConsumablesAfterBattle,
  openSkillPicker,
  handleSkillPick,
  handleSkillTarget,
} from '../engine/battle-helpers.js';
import {
  buildActionRow,
  buildPanelOpenerRow,
  buildTargetRow,
} from '../ui/battle-buttons.js';
import { displayName } from '../../../utils.js';

interface DuelBattleState extends BattleState {
  /** kopia PlayerStats do logowania na koniec walki */
  pStats: Map<string, PlayerStats>;
  isPartyDuel: boolean;
}

export class DuelService {
  private readonly states = new Map<string, DuelBattleState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, registerThread } = ctx;
    const opponent = msg.mentions?.users?.first();
    if (!opponent || opponent.id === msg.author.id) {
      await msg.reply('Użycie: `.duel @przeciwnik` — wybierz innego (żywego) użytkownika.');
      return;
    }
    if (opponent.bot) {
      await msg.reply('Z botami się nie biję, znajdź sobie człowieka.');
      return;
    }

    const myParty = this.party.getByMember(msg.author.id);
    const oppParty = this.party.getByMember(opponent.id);
    if (myParty && oppParty && myParty.id !== oppParty.id) {
      return this.startPartyDuel(ctx, myParty, oppParty);
    }

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Duel: ${displayName(msg)} vs ${opponent.username}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await msg.reply(`Nie udało się otworzyć wątku: ${(e as Error).message}`);
      return;
    }

    const stats1 = this.stats.get(msg.author.id, displayName(msg));
    const stats2 = this.stats.get(opponent.id, opponent.globalName || opponent.username);

    const p1Raw = buildPlayerCombatant(this.stats, stats1);
    const p2Raw = buildPlayerCombatant(this.stats, stats2);

    const p1: BattleCombatant = { ...p1Raw, team: 0, controller: 'human' };
    const p2: BattleCombatant = { ...p2Raw, team: 1, controller: 'human' };

    const state: DuelBattleState = {
      id: thread.id,
      thread,
      combatants: [p1, p2],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      isPartyDuel: false,
      pStats: new Map([
        [stats1.id, stats1],
        [stats2.id, stats2],
      ]),
    };
    this.states.set(thread.id, state);

    await thread.send(
      `⚔️ **Pojedynek!**\n` +
        `${this.fmtPlayer(p1, stats1)} **vs** ${this.fmtPlayer(p2, stats2)}\n` +
        `Każdy ma ${POTIONS_START} mikstury. W każdej rundzie obaj wybieracie akcję — wynik rozlicza się gdy obaj klikną.`,
    );
    await this.promptHumans(state);
  }

  private async startPartyDuel(
    ctx: ICommandContext,
    partyA: Party,
    partyB: Party,
  ): Promise<void> {
    const { msg, registerThread } = ctx;

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Party-Duel: ${displayName(msg)} vs ${partyB.members.length}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await msg.reply(`Nie udało się otworzyć wątku: ${(e as Error).message}`);
      return;
    }

    const buildSide = (memberIds: string[], team: number) => {
      return memberIds.map((id) => {
        const fallback = id === msg.author.id ? displayName(msg) : id;
        const ps = this.stats.get(id, fallback);
        const raw = buildPlayerCombatant(this.stats, ps);
        const combatant: BattleCombatant = { ...raw, team, controller: 'human' };
        return { combatant, stats: ps };
      });
    };

    const sideA = buildSide(partyA.members, 0);
    const sideB = buildSide(partyB.members, 1);
    const all = [...sideA, ...sideB];

    const state: DuelBattleState = {
      id: thread.id,
      thread,
      combatants: all.map((x) => x.combatant),
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      isPartyDuel: true,
      pStats: new Map(all.map((x) => [x.stats.id, x.stats])),
    };
    this.states.set(thread.id, state);

    const fmtSide = (side: typeof sideA) =>
      side.map((x) => `<@${x.combatant.id}> (L${x.stats.level} · ${x.combatant.hp} HP)`).join(', ');

    await thread.send(
      `⚔️ **Party-Duel!** ${sideA.length} vs ${sideB.length}\n` +
        `**Drużyna A:** ${fmtSide(sideA)}\n` +
        `**Drużyna B:** ${fmtSide(sideB)}\n` +
        `Każdy klika niezależnie. Runda się rozliczy gdy wszyscy żyjący wybiorą akcję.`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    const id = interaction.customId;
    if (id.startsWith('pnl:')) return this.handlePanel(interaction);
    if (id.startsWith('bat:')) return this.handleAction(interaction);
    if (id.startsWith('tgt:')) return this.handleTarget(interaction);
    if (id.startsWith('itmpick:')) return this.handleItemPick(interaction);
    if (id.startsWith('sklpick:')) return this.handleSklPick(interaction);
    if (id.startsWith('skltgt:')) return this.handleSklTarget(interaction);
  }

  private async handlePanel(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await interaction.reply({ content: 'Walka już się skończyła.', ephemeral: true }).catch(() => {});
      return;
    }
    const me = findCombatant(state, interaction.user.id);
    if (!me || me.controller !== 'human') {
      await interaction.reply({ content: 'Nie bierzesz udziału w tej walce.', ephemeral: true }).catch(() => {});
      return;
    }
    if (me.hp <= 0) {
      await interaction.reply({ content: 'Już nie żyjesz w tej walce.', ephemeral: true }).catch(() => {});
      return;
    }
    if (state.pending.has(me.id)) {
      await interaction.reply({ content: 'Już wybrałeś akcję — czekamy na pozostałych.', ephemeral: true }).catch(() => {});
      return;
    }
    const hasSkills = (me.skills ?? []).length > 0;
    await interaction.reply({
      content: `🎮 Runda ${state.roundNumber} — wybierz akcję (${me.hp}/${me.maxHp} HP):`,
      ephemeral: true,
      components: [buildActionRow(state.id, me.id, false, hasSkills)],
    }).catch(() => {});
  }

  private async handleItemPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) return;
    const recorded = await recordItemPick(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleSklPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) return;
    const recorded = await handleSkillPick(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleSklTarget(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) return;
    const recorded = await handleSkillTarget(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleAction(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) return;
    if (interaction.user.id !== combatantId) {
      await interaction.reply({ content: 'Nie bierzesz udziału w tym pojedynku.', ephemeral: true }).catch(() => {});
      return;
    }
    const me = findCombatant(state, combatantId);
    if (!me || me.hp <= 0) return;
    if (state.pending.has(combatantId)) {
      await interaction.reply({ content: 'Już wybrałeś akcję — czekamy na drugiego.', ephemeral: true }).catch(() => {});
      return;
    }

    if (kind === 'def') {
      state.pending.set(combatantId, { kind: 'defend' });
      await interaction.reply({ content: 'Wybrałeś: **Obrona**.', ephemeral: true }).catch(() => {});
    } else if (kind === 'itm') {
      await openItemPicker(interaction, battleId, combatantId, me);
      return;
    } else if (kind === 'skl') {
      await openSkillPicker(interaction, battleId, combatantId, me);
      return;
    } else if (kind === 'atk') {
      const enemies = aliveEnemies(state, me);
      if (enemies.length === 0) return;
      if (enemies.length === 1) {
        state.pending.set(combatantId, { kind: 'attack', targetId: enemies[0].id });
        await interaction.reply({ content: `Atak na **${enemies[0].name}**.`, ephemeral: true }).catch(() => {});
      } else {
        const row = buildTargetRow(battleId, combatantId, 'atk', enemies);
        await interaction.reply({ content: 'Wybierz cel:', ephemeral: true, components: [row] }).catch(() => {});
        return;
      }
    } else {
      return;
    }

    await this.maybeResolve(state);
  }

  private async handleTarget(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind, targetId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) return;
    if (interaction.user.id !== combatantId) return;
    if (state.pending.has(combatantId)) return;
    if (kind === 'atk') {
      const target = findCombatant(state, targetId);
      if (!target || target.hp <= 0) {
        await interaction.update({ content: 'Cel padł.', components: [] }).catch(() => {});
        return;
      }
      state.pending.set(combatantId, { kind: 'attack', targetId });
      await interaction.update({ content: `Wybrany cel: **${target.name}**.`, components: [] }).catch(() => {});
    }
    await this.maybeResolve(state);
  }

  private async maybeResolve(state: DuelBattleState): Promise<void> {
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    // disable old prompts
    for (const [allyId, msgId] of state.promptMessageIds) {
      try {
        const m = await state.thread.messages.fetch(msgId).catch(() => null);
        if (!m) continue;
        const row = allyId === '__panel__'
          ? buildPanelOpenerRow(state.id, true)
          : buildActionRow(state.id, allyId, true);
        await m.edit({ components: [row] }).catch(() => {});
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);

    if (result.finished) {
      await this.finish(state, result);
      return;
    }

    await state.thread.send(
      [
        ...result.lines,
        '',
        this.fmtBoard(state),
        `⏭ Runda ${state.roundNumber}`,
      ].join('\n'),
    );
    await this.promptHumans(state);
  }

  private async finish(state: DuelBattleState, result: { draw?: boolean; winnerTeam?: number }): Promise<void> {
    syncConsumablesAfterBattle(this.stats, state);
    if (result.draw) {
      await state.thread.send(`💀 **REMIS!** Wszyscy padli w tej samej rundzie — brak XP.`);
      this.states.delete(state.id);
      return;
    }

    const winnerCombatants = state.combatants.filter((c) => c.team === result.winnerTeam);
    const loserCombatants = state.combatants.filter((c) => c.team !== result.winnerTeam);

    if (state.isPartyDuel || winnerCombatants.length > 1 || loserCombatants.length > 1) {
      const award = this.stats.awardPartyWin(
        winnerCombatants.map((c) => ({ id: c.id, name: c.name })),
        loserCombatants.map((c) => ({ id: c.id, name: c.name })),
      );
      const winLines = award.winners.map(
        (w) =>
          `🏆 ${w.stats.name} L${w.stats.level} (+${w.gainedXp} XP)` +
          (w.leveledUp ? ` 🎉 lvl-up!` : ''),
      );
      const loseLines = award.losers.map(
        (l) => `💀 ${l.stats.name} L${l.stats.level} (+${l.gainedXp} XP)`,
      );
      await state.thread.send(
        [
          `**Drużyna ${result.winnerTeam === 0 ? 'A' : 'B'}** wygrywa party-duel!`,
          ...winLines,
          ...loseLines,
        ].join('\n'),
      );
      this.states.delete(state.id);
      return;
    }

    const winnerCombatant = winnerCombatants[0];
    const loserCombatant = loserCombatants[0];
    const award = this.stats.awardWin(
      winnerCombatant.id,
      winnerCombatant.name,
      loserCombatant.id,
      loserCombatant.name,
    );
    const levelMsg = award.winnerLeveledUp
      ? `\n🎉 **${award.winner.name}** awansuje na poziom **${award.winner.level}**! (+1 punkt do rozdania)`
      : '';
    await state.thread.send(
      [
        `💀 **${loserCombatant.name}** pada! Zwycięża **${winnerCombatant.name}** (${winnerCombatant.hp}/${winnerCombatant.maxHp} HP). 🏆`,
        `📈 ${winnerCombatant.name} L${award.winner.level} (${award.winner.xp} XP, ${award.winner.wins}W/${award.winner.losses}L) | ${loserCombatant.name} L${award.loser.level} (${award.loser.xp} XP, ${award.loser.wins}W/${award.loser.losses}L).${levelMsg}`,
      ].join('\n'),
    );
    this.states.delete(state.id);
  }

  private async promptHumans(state: DuelBattleState): Promise<void> {
    if (state.isPartyDuel) {
      const aliveHumans = state.combatants.filter(
        (c) => c.controller === 'human' && c.hp > 0,
      );
      if (aliveHumans.length === 0) return;
      const mentions = aliveHumans.map((c) => `<@${c.id}>`).join(' ');
      const sent = await state.thread.send({
        content: `🎮 Runda ${state.roundNumber} — ${mentions}, kliknij, by otworzyć swój panel akcji.`,
        components: [buildPanelOpenerRow(state.id)],
      });
      state.promptMessageIds.set('__panel__', sent.id);
      return;
    }
    for (const c of state.combatants) {
      if (c.controller !== 'human' || c.hp <= 0) continue;
      const hasSkills = (c.skills ?? []).length > 0;
      const sent = await state.thread.send({
        content: `<@${c.id}> — runda ${state.roundNumber}, wybierz akcję:`,
        components: [buildActionRow(state.id, c.id, false, hasSkills)],
      });
      state.promptMessageIds.set(c.id, sent.id);
    }
  }

  private fmtPlayer(c: BattleCombatant, p: PlayerStats): string {
    return `**${c.name}** (PvP L${p.level} · combat L${p.skills.combat.level} · ${c.hp}/${c.maxHp} HP · +${c.damageBonus} dmg)`;
  }

  private fmtBoard(state: DuelBattleState): string {
    return state.combatants
      .map((c) => `${c.name}: ${c.hp}/${c.maxHp} HP (mikstury: ${c.potionsLeft})`)
      .join(' | ');
  }
}
