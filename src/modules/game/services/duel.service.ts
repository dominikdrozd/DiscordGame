import { randomUUID } from 'node:crypto';
import {
  ChannelType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService, type Party } from './party.js';
import {
  type BattleCombatant,
  type BattleState,
  humansAlive,
} from '../engine/battle-state.js';
import { resolveBattleRound } from '../engine/combat-battle.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
} from '../engine/battle-helpers.js';
import { buildPanelOpenerRow } from '../ui/battle-buttons.js';
import { displayName, errMsg } from '../../../utils.js';
import type { QuestService } from './quest.service.js';
import { chat } from '../../../managers/chat.manager.js';

import { hasThreadCreate } from '../engine/discord-helpers.js';

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
    private readonly quests?: QuestService,
  ) {}

  /** Slash `/duel user:@target` — ephemeral confirm + public thread z walką. */
  async startFromSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const opponent = interaction.options.getUser('user', true);
    if (opponent.id === interaction.user.id) {
      await chat.reply(interaction, 'Nie możesz pojedynkować się ze sobą.', { ephemeral: true });
      return;
    }
    if (opponent.bot) {
      await chat.reply(interaction, 'Z botami się nie biję, znajdź sobie człowieka.', {
        ephemeral: true,
      });
      return;
    }
    const channel: unknown = interaction.channel;
    if (!hasThreadCreate(channel)) {
      await chat.reply(
        interaction,
        'Ten kanał nie wspiera wątków — użyj `.duel @user` w innym kanale.',
        { ephemeral: true },
      );
      return;
    }
    await chat.deferReply(interaction, true);
    const myParty = this.party.getByMember(interaction.user.id);
    const oppParty = this.party.getByMember(opponent.id);
    if (myParty && oppParty && myParty.id !== oppParty.id) {
      await chat.editReply(
        interaction,
        'Party-duel ze slash nie jest jeszcze wspierany — użyj `.duel @user`.',
      );
      return;
    }

    const stats1 = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const stats2 = this.stats.get(opponent.id, opponent.globalName || opponent.username);

    if (stats1.activeExpedition) {
      await chat.editReply(interaction, '🚫 Jesteś na wyprawie — pojedynki niedostępne.');
      return;
    }
    if (stats2.activeExpedition) {
      await chat.editReply(
        interaction,
        `🚫 <@${opponent.id}> jest na wyprawie — nie może walczyć teraz.`,
      );
      return;
    }

    let thread: unknown;
    try {
      thread = await channel.threads.create({
        name: `Duel: ${stats1.name} vs ${opponent.username}`.slice(0, 100),
        autoArchiveDuration: 60,
        type: ChannelType.PublicThread,
      });
    } catch (e) {
      await chat.editReply(interaction, `Nie udało się otworzyć wątku: ${errMsg(e)}`);
      return;
    }
    if (!thread || typeof thread !== 'object' || !('id' in thread) || typeof thread.id !== 'string') {
      await chat.editReply(interaction, 'Wątek utworzony, ale brak API.');
      return;
    }
    await this.startBattleInThread(thread, stats1, stats2, false);
    await chat.editReply(interaction, `⚔️ Pojedynek otwarty: <#${thread.id}>`);
  }

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, registerThread } = ctx;
    const opponent = msg.mentions?.users?.first();
    if (!opponent || opponent.id === msg.author.id) {
      await chat.replyToMessage(msg, 'Użycie: `.duel @przeciwnik` — wybierz innego (żywego) użytkownika.');
      return;
    }
    if (opponent.bot) {
      await chat.replyToMessage(msg, 'Z botami się nie biję, znajdź sobie człowieka.');
      return;
    }

    const myStats = this.stats.get(msg.author.id, displayName(msg));
    if (myStats.activeExpedition) {
      await chat.replyToMessage(msg, '🚫 Jesteś na wyprawie — pojedynki niedostępne. Dokończ wyprawę najpierw.');
      return;
    }
    const oppStatsCheck = this.stats.get(opponent.id, opponent.globalName || opponent.username);
    if (oppStatsCheck.activeExpedition) {
      await chat.replyToMessage(msg, `🚫 <@${opponent.id}> jest na wyprawie — nie może walczyć teraz.`);
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
      await chat.replyToMessage(msg, `Nie udało się otworzyć wątku: ${errMsg(e)}`);
      return;
    }

    const stats1 = this.stats.get(msg.author.id, displayName(msg));
    const stats2 = this.stats.get(opponent.id, opponent.globalName || opponent.username);
    await this.startBattleInThread(thread, stats1, stats2, false);
  }

  /**
   * Wspólny entry-point — wymaga pre-utworzonego wątku. Używany z `start(ctx)`
   * (`.duel @user`) i z `startFromSlash` (`/duel user:@user`).
   */
  async startBattleInThread(
    thread: any,
    stats1: PlayerStats,
    stats2: PlayerStats,
    isPartyDuel: boolean,
  ): Promise<void> {
    const p1Raw = buildPlayerCombatant(this.stats, stats1);
    const p2Raw = buildPlayerCombatant(this.stats, stats2);

    const p1: BattleCombatant = { ...p1Raw, team: 0, controller: 'human' };
    const p2: BattleCombatant = { ...p2Raw, team: 1, controller: 'human' };

    const state: DuelBattleState = {
      _battleId: randomUUID(),
      id: thread.id,
      thread,
      combatants: [p1, p2],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      isPartyDuel,
      pStats: new Map([
        [stats1.id, stats1],
        [stats2.id, stats2],
      ]),
    };
    this.states.set(thread.id, state);

    await chat.send(
      thread,
      `⚔️ **Pojedynek!**\n` +
        `${this.fmtPlayer(p1, stats1)} **vs** ${this.fmtPlayer(p2, stats2)}\n` +
        `Mikstury używasz tylko z plecaka. W każdej rundzie obaj wybieracie akcję — wynik rozlicza się gdy obaj klikną.`,
    );
    await this.promptHumans(state);
  }

  private async startPartyDuel(ctx: ICommandContext, partyA: Party, partyB: Party): Promise<void> {
    const { msg, registerThread } = ctx;

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Party-Duel: ${displayName(msg)} vs ${partyB.members.length}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await chat.replyToMessage(msg, `Nie udało się otworzyć wątku: ${errMsg(e)}`);
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
      _battleId: randomUUID(),
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

    await chat.send(
      thread,
      `⚔️ **Party-Duel!** ${sideA.length} vs ${sideB.length}\n` +
        `**Drużyna A:** ${fmtSide(sideA)}\n` +
        `**Drużyna B:** ${fmtSide(sideB)}\n` +
        `Każdy klika niezależnie. Runda się rozliczy gdy wszyscy żyjący wybiorą akcję.`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    await routeBattleInteraction<DuelBattleState>(interaction, {
      getState: (id) => this.states.get(id),
      onChoiceRecorded: (state) => this.maybeResolve(state),
      notMineMessage: 'Nie bierzesz udziału w tym pojedynku.',
    });
  }

  private async maybeResolve(state: DuelBattleState): Promise<void> {
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    // disable old prompts (panel opener row staje się `disabled`)
    for (const [, msgId] of state.promptMessageIds) {
      try {
        const m = await state.thread.messages.fetch(msgId).catch(() => null);
        if (!m) continue;
        await chat.edit(m, { components: [buildPanelOpenerRow(state.id, true)] });
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);

    // Log walki — wysyłany ZAWSZE, też dla ostatniej rundy (gdy ktoś ginie),
    // żeby gracze widzieli decydujący cios przed komunikatem o zwycięstwie.
    if (result.lines.length > 0) {
      await chat.send(
        state.thread,
        [...result.lines, '', this.fmtBoard(state)].join('\n'),
      );
    }

    if (result.finished) {
      await this.finish(state, result);
      return;
    }

    await chat.send(state.thread, `⏭ Runda ${state.roundNumber}`);
    await this.promptHumans(state);
  }

  private async finish(
    state: DuelBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    syncConsumablesAfterBattle(this.stats, state);
    if (result.draw) {
      await postBattleSummary(
        state.thread,
        `💀 **REMIS!** Pojedynek zakończył się remisem — wszyscy padli w tej samej rundzie. Brak XP.`,
      );
      await closeBattleThread(state.thread, '🏁 Pojedynek zakończony — wątek archiwizujemy.');
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
      // Quest hook — auto-complete duel questów dla obu stron.
      const questLines: string[] = [];
      if (this.quests) {
        for (const w of award.winners) questLines.push(...this.quests.onDuelComplete(w.stats, true));
        for (const l of award.losers) questLines.push(...this.quests.onDuelComplete(l.stats, false));
      }
      await postBattleSummary(
        state.thread,
        [
          `⚔️ **Party-duel zakończony!** Drużyna **${result.winnerTeam === 0 ? 'A' : 'B'}** wygrywa.`,
          ...winLines,
          ...loseLines,
          ...questLines,
        ].join('\n'),
      );
      await closeBattleThread(state.thread, '🏁 Party-duel zakończony — wątek archiwizujemy.');
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
    // Quest hook — auto-complete duel questów dla obu stron.
    const questLines: string[] = [];
    if (this.quests) {
      questLines.push(...this.quests.onDuelComplete(award.winner, true));
      questLines.push(...this.quests.onDuelComplete(award.loser, false));
    }
    await postBattleSummary(
      state.thread,
      [
        `⚔️ **Pojedynek rozstrzygnięty!**`,
        `💀 **${loserCombatant.name}** pada! Zwycięża **${winnerCombatant.name}** (${winnerCombatant.hp}/${winnerCombatant.maxHp} HP). 🏆`,
        `📈 ${winnerCombatant.name} L${award.winner.level} (${award.winner.xp} XP, ${award.winner.wins}W/${award.winner.losses}L) | ${loserCombatant.name} L${award.loser.level} (${award.loser.xp} XP, ${award.loser.wins}W/${award.loser.losses}L).${levelMsg}`,
        ...questLines,
      ].join('\n'),
    );
    await closeBattleThread(state.thread, '🏁 Pojedynek zakończony — wątek archiwizujemy.');
    this.states.delete(state.id);
  }

  private async promptHumans(state: DuelBattleState): Promise<void> {
    await promptHumansWithPanel(state);
  }

  private fmtPlayer(c: BattleCombatant, p: PlayerStats): string {
    return `**${c.name}** (PvP L${p.level} · combat L${p.skills.combat.level} · ${c.hp}/${c.maxHp} HP · +${c.damageBonus} dmg)`;
  }

  private fmtBoard(state: DuelBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (potki: ${c.consumables?.potion_small ?? 0})` : ` (potki: ${c.potionsLeft})`}`,
      )
      .join(' | ');
  }
}
