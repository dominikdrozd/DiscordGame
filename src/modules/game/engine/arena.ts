import { randomUUID } from 'node:crypto';
import {
  type ButtonInteraction,
  type Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { PartyService } from '../services/party.js';
import { ExpeditionService } from '../services/expedition.service.js';
import { type BattleState, humansAlive } from './battle-state.js';
import { resolveBattleRound } from './combat-battle.js';
import { buildHumanCombatant } from './player-combatant.js';
import {
  type SendableThread,
  hasSendable,
  hasThreadCreate,
  isSendableThread,
  disableMessageComponents,
  sendMentionBatches,
} from './discord-helpers.js';
import { nextSlotAfter } from './scheduling.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
} from './battle-helpers.js';
import { buildPanelOpenerRow } from '../ui/battle-buttons.js';
import { errMsg } from '../../../utils.js';
import { chat } from '../../../managers/chat.manager.js';

const TICK_MS = 60_000;
/** Codzienna godzina ogłoszenia areny (lokalna strefa). */
const ARENA_HOUR = 18;
/** Minuta w godzinie. */
const ARENA_MINUTE = 10;
/** Okno rejestracji od ogłoszenia do startu turnieju. */
const REGISTRATION_WINDOW_MS = 5 * 60_000;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 8;

const WINNER_GOLD = 1500;
const WINNER_XP = 800;
const WINNER_COMBAT_XP = 400;
const RUNNER_UP_GOLD = 400;
const RUNNER_UP_XP = 200;

interface ArenaEvent {
  channelId: string;
  announceMsgId?: string;
  participants: Set<string>;
  registrationEndsAt: number;
}

/** Aktywny round-robin turniej — pojedynczy globalnie (jeden dziennie). */
interface ArenaTournament {
  thread: SendableThread;
  channelId: string;
  participantIds: string[];
  /** Pary wygenerowane round-robin (każdy z każdym). Iterujemy `currentMatchIdx`. */
  pairs: Array<[string, string]>;
  currentMatchIdx: number;
  /** Wins per player — finalny ranking sortuje desc. */
  scores: Map<string, number>;
  /** Aktualnie aktywna walka 1v1 (gdy match w toku). */
  currentBattle?: BattleState;
}


function buildAnnounceRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('arenajoin')
      .setLabel('🏟️ Dołącz do areny')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('arenacancelexp')
      .setLabel('🚫 Anuluj wyprawę')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Round-robin pair scheduling: każdy z każdym dokładnie raz.
 * Dla N graczy: N*(N-1)/2 par. Public + pure → łatwe testy.
 */
export function buildRoundRobinPairs(participantIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      pairs.push([participantIds[i], participantIds[j]]);
    }
  }
  return pairs;
}

/**
 * Arena Service — codzienny round-robin turniej PvP o 18:10.
 *
 * Flow:
 *  1. Tick co 60s → o 18:10 announcement z pingiem wszystkich graczy.
 *  2. 15 min okno rejestracji (button "Dołącz" + "Anuluj wyprawę").
 *  3. Po oknie: jeśli ≥2 zapisanych — round-robin schedule, każdy gra
 *     z każdym po jednej walce w arenie-wątku.
 *  4. Każda walka **interaktywna** (jak w duelu) — gracze klikają panel,
 *     wybierają atak/skill/item/obronę, runda resolve gdy obaj podadzą.
 *  5. Po wszystkich walkach: ranking po liczbie wygranych. Mistrz dostaje
 *     gold + XP od miasta, runner-up częściowy reward.
 */
export class ArenaService {
  private timer: NodeJS.Timeout | null = null;
  private pendingEvent: ArenaEvent | null = null;
  /** Pojedynczy globalny turniej — `null` gdy nieaktywny. */
  private tournament: ArenaTournament | null = null;
  private nextSpawnAt: number = 0;

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly expeditions: ExpeditionService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextSpawnAt = nextSlotAfter(Date.now(), [ARENA_HOUR], ARENA_MINUTE);
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.error('[arena] tick fail:', errMsg(e)));
    }, TICK_MS);
    this.timer.unref?.();
    console.log(`[arena] loop started, next at ${new Date(this.nextSpawnAt).toISOString()}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async forceSpawn(): Promise<void> {
    await this.spawnAnnouncement();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    if (this.pendingEvent && now >= this.pendingEvent.registrationEndsAt) {
      const evt = this.pendingEvent;
      this.pendingEvent = null;
      try {
        await this.tryStartTournament(evt);
      } catch (e) {
        console.error('[arena] tryStartTournament threw:', errMsg(e));
      }
    }
    // Po spawnAnnouncement nextSpawnAt advances do jutra → tick nie odpali
    // ponownie tego samego dnia.
    if (now >= this.nextSpawnAt) {
      this.nextSpawnAt = nextSlotAfter(now, [ARENA_HOUR], ARENA_MINUTE);
      await this.spawnAnnouncement();
    }
  }

  private async spawnAnnouncement(): Promise<void> {
    const channelId = process.env.ARENA_CHANNEL_ID ?? process.env.WORLD_BOSS_CHANNEL_ID;
    if (!channelId) {
      console.warn(
        '[arena] ARENA_CHANNEL_ID (ani WORLD_BOSS_CHANNEL_ID) nie ustawione — pomijam announcement.',
      );
      return;
    }
    if (this.pendingEvent || this.tournament) return;

    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) {
      console.error(`[arena] channel ${channelId} unreachable`);
      return;
    }

    const mentions = this.stats.list().map((p) => `<@${p.id}>`);
    const MENTION_BATCH = 50;

    const registrationEndsAt = Date.now() + REGISTRATION_WINDOW_MS;
    const sent = await chat.send(
      channel,
      [
        '🏟️ **ARENA OTWARTA!**',
        mentions.slice(0, MENTION_BATCH).join(' '),
        `Codzienny turniej PvP. Rejestracja **${Math.round(REGISTRATION_WINDOW_MS / 60_000)} min**.`,
        `Min ${MIN_PARTICIPANTS}, max ${MAX_PARTICIPANTS} graczy. **Round-robin** — każdy walczy z każdym (interaktywne walki).`,
        `🏆 **Mistrz:** ${WINNER_GOLD} zł + ${WINNER_XP} PvP XP + ${WINNER_COMBAT_XP} combat XP.`,
        `🥈 **Runner-up:** ${RUNNER_UP_GOLD} zł + ${RUNNER_UP_XP} PvP XP.`,
        '',
        '_Gracze na ekspedycji nie mogą startować — kliknij **Anuluj wyprawę** żeby się zapisać._',
      ]
        .filter(Boolean)
        .join('\n'),
      { components: [buildAnnounceRow()] },
    );

    const announceMsgId =
      sent && typeof sent === 'object' && 'id' in sent && typeof (sent as { id: unknown }).id === 'string'
        ? (sent as { id: string }).id
        : undefined;

    await sendMentionBatches(channel, mentions, MENTION_BATCH, MENTION_BATCH);

    this.pendingEvent = {
      channelId,
      announceMsgId,
      participants: new Set(),
      registrationEndsAt,
    };
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (interaction.customId === 'arenajoin') return this.handleJoin(interaction);
    if (interaction.customId === 'arenacancelexp') return this.handleCancelExpedition(interaction);

    const t = this.tournament;
    if (!t) return;
    await routeBattleInteraction<BattleState>(interaction, {
      getState: (id) =>
        t.currentBattle && t.currentBattle.id === id ? t.currentBattle : undefined,
      onChoiceRecorded: () => this.maybeResolve(t),
      notMineMessage: 'To nie twój match.',
      alreadyDeadMessage: 'Już padłeś w tym matchu.',
    });
  }

  private async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const evt = this.pendingEvent;
    if (!evt) {
      await chat.reply(interaction, 'Rejestracja zamknięta — następna arena jutro o 18:10.', {
        ephemeral: true,
      });
      return;
    }
    const userId = interaction.user.id;
    const player = this.stats.get(
      userId,
      interaction.user.globalName ?? interaction.user.username,
    );
    if (player.activeExpedition) {
      await chat.reply(
        interaction,
        '🚫 Jesteś na wyprawie — kliknij **Anuluj wyprawę** żeby się wypisać i dołączyć do areny.',
        { ephemeral: true },
      );
      return;
    }
    if (evt.participants.has(userId)) {
      await chat.reply(interaction, '✅ Już zapisany — czekaj na start.', { ephemeral: true });
      return;
    }
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      await chat.reply(interaction, `Slot pełny (max ${MAX_PARTICIPANTS}).`, { ephemeral: true });
      return;
    }
    evt.participants.add(userId);
    await chat.reply(
      interaction,
      `🏟️ Dołączasz! Zapisanych: ${evt.participants.size}/${MAX_PARTICIPANTS}.`,
      { ephemeral: true },
    );
  }

  private async handleCancelExpedition(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    if (!player.activeExpedition) {
      await chat.reply(interaction, 'Nie jesteś na żadnej wyprawie.', { ephemeral: true });
      return;
    }
    const partyId = player.activeExpedition.partyId;
    if (partyId) {
      const partyEntity = this.party.get(partyId);
      if (partyEntity && partyEntity.leaderId !== userId) {
        await chat.reply(
          interaction,
          `🚫 Tylko **lider party** (<@${partyEntity.leaderId}>) może anulować wyprawę party.`,
          { ephemeral: true },
        );
        return;
      }
      const members = partyEntity ? partyEntity.members : [userId];
      for (const memberId of members) {
        const m = this.stats.get(memberId);
        m.activeExpedition = null;
      }
      this.stats.save();
      await chat.reply(
        interaction,
        `✅ Wyprawa party anulowana (${members.length} graczy zwolnionych).`,
        { ephemeral: true },
      );
      return;
    }
    player.activeExpedition = null;
    this.stats.save();
    await chat.reply(interaction, '✅ Twoja solo-wyprawa anulowana.', { ephemeral: true });
  }

  async tryStartTournament(evt: ArenaEvent): Promise<void> {
    const channel = await this.client.channels.fetch(evt.channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) {
      console.error('[arena] channel unreachable on tournament start');
      return;
    }

    // Filtr: gracz mógł zaczać ekspedycję po zarejestrowaniu (np. party leader
    // wystartował go przez party-expedition w trakcie 5-min okna). Wykluczamy
    // wszystkich z aktywną wyprawą — handleJoin blokuje wstęp ale nie usuwa,
    // więc participants może mieć "zatęchłych" graczy.
    const droppedOnExpedition: string[] = [];
    for (const id of [...evt.participants]) {
      const p = this.stats.get(id);
      if (p.activeExpedition) {
        evt.participants.delete(id);
        droppedOnExpedition.push(id);
      }
    }
    if (droppedOnExpedition.length > 0) {
      await chat.send(
        channel,
        `⚠️ Wykluczeni z areny (są na wyprawie): ${droppedOnExpedition.map((id) => `<@${id}>`).join(', ')}`,
      );
    }

    if (evt.participants.size < MIN_PARTICIPANTS) {
      await chat.send(
        channel,
        `🏟️ Arena anulowana — za mało chętnych (${evt.participants.size}/${MIN_PARTICIPANTS}).`,
      );
      await this.disableAnnounceButton(evt);
      return;
    }

    if (!('threads' in channel) || typeof (channel as { threads?: unknown }).threads !== 'object') {
      await chat.send(channel, 'Nie mogę otworzyć wątku areny — kanał nie wspiera wątków.');
      return;
    }
    const threadsApi = (channel as {
      threads: { create?: (opts: unknown) => Promise<unknown> };
    }).threads;
    if (!threadsApi.create) {
      await chat.send(channel, 'Nie mogę otworzyć wątku areny — brak API.');
      return;
    }
    const thread = await threadsApi
      .create({
        name: `🏟️ Arena ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch((e) => {
        console.error('[arena] thread create fail:', errMsg(e));
        return null;
      });
    if (!isSendableThread(thread)) {
      await chat.send(channel, 'Nie udało się otworzyć wątku areny (brak permissions albo limit).');
      return;
    }

    await this.disableAnnounceButton(evt);

    const participantIds = [...evt.participants];
    const pairs = buildRoundRobinPairs(participantIds);
    const scores = new Map<string, number>();
    for (const id of participantIds) scores.set(id, 0);

    this.tournament = {
      thread,
      channelId: evt.channelId,
      participantIds,
      pairs,
      currentMatchIdx: 0,
      scores,
    };

    const intro = [
      '🏟️ **ARENA — TURNIEJ ROZPOCZĘTY!**',
      `Uczestników: **${participantIds.length}** · Walk: **${pairs.length}** (round-robin, każdy z każdym).`,
      'Każda walka jest **interaktywna** — klikajcie panel akcji jak w duelu.',
      'Po wszystkich walkach ranking po liczbie wygranych.',
      '',
      participantIds.map((id) => `<@${id}>`).join(' '),
    ].join('\n');
    await chat.send(thread, intro);

    await this.startNextMatch(this.tournament);
  }

  /**
   * Inicjuje match `t.currentMatchIdx`. Buduje BattleState 1v1 i wysyła
   * panel-opener. Gdy `currentMatchIdx >= pairs.length` — koniec turnieju.
   */
  private async startNextMatch(t: ArenaTournament): Promise<void> {
    if (t.currentMatchIdx >= t.pairs.length) {
      await this.endTournament(t);
      return;
    }
    const [aId, bId] = t.pairs[t.currentMatchIdx];
    const a = this.stats.get(aId);
    const b = this.stats.get(bId);
    const ca = buildHumanCombatant(this.stats, a, 0);
    const cb = buildHumanCombatant(this.stats, b, 1);
    const battleId = `arena_${Date.now().toString(36)}_${t.currentMatchIdx}`;
    const state: BattleState = {
      _battleId: randomUUID(),
      id: battleId,
      thread: t.thread,
      combatants: [ca, cb],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
    };
    t.currentBattle = state;

    await chat.send(
      t.thread,
      [
        `⚔️ **Match ${t.currentMatchIdx + 1}/${t.pairs.length}**`,
        `<@${aId}> (${ca.hp} HP) vs <@${bId}> (${cb.hp} HP)`,
        'Obaj klikajcie **Otwórz panel** żeby wybrać akcję — runda rozliczy się gdy oboje podadzą.',
      ].join('\n'),
    );
    await promptHumansWithPanel(state);
  }

  private async maybeResolve(t: ArenaTournament): Promise<void> {
    const state = t.currentBattle;
    if (!state) return;
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    for (const [, msgId] of state.promptMessageIds) {
      try {
        const m = await t.thread.messages?.fetch(msgId).catch(() => null);
        if (m) await chat.edit(m, { components: [buildPanelOpenerRow(state.id, true)] });
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);
    const lines = [...result.lines];

    if (result.finished) {
      // Match end — kto został przy życiu wygrywa.
      const aliveOnes = state.combatants.filter((c) => c.hp > 0);
      lines.push('', this.fmtBoard(state));
      if (aliveOnes.length === 1) {
        const winnerId = aliveOnes[0].id;
        t.scores.set(winnerId, (t.scores.get(winnerId) ?? 0) + 1);
        lines.push('', `🏆 **Match ${t.currentMatchIdx + 1}** — wygrywa <@${winnerId}>!`);
      } else {
        lines.push('', `⚖️ **Match ${t.currentMatchIdx + 1}** — remis (oboje padli), brak punktu.`);
      }
      lines.push('', this.fmtStandings(t));
      await chat.send(t.thread, lines.join('\n'));

      // Sync consumables (potki użyte) do PlayerStats per gracz.
      syncConsumablesAfterBattle(this.stats, state);
      this.stats.save();

      t.currentBattle = undefined;
      t.currentMatchIdx += 1;
      // Pauza wizualna 2s — Discord nie spamuje rapid-fire.
      await new Promise((r) => setTimeout(r, 2000));
      await this.startNextMatch(t);
      return;
    }

    await chat.send(
      t.thread,
      [...lines, '', this.fmtBoard(state), `⏭ Runda ${state.roundNumber}`].join('\n'),
    );
    await promptHumansWithPanel(state);
  }

  private async endTournament(t: ArenaTournament): Promise<void> {
    const ranking = [...t.scores.entries()].sort((a, b) => b[1] - a[1]);
    const winnerEntry = ranking[0];
    const runnerUpEntry = ranking[1];

    if (winnerEntry) {
      const w = this.stats.get(winnerEntry[0]);
      this.stats.addGold(w, WINNER_GOLD);
      this.stats.addXp(w, WINNER_XP);
      this.stats.addSkillXp(w, 'combat', WINNER_COMBAT_XP);
    }
    if (runnerUpEntry) {
      const r = this.stats.get(runnerUpEntry[0]);
      this.stats.addGold(r, RUNNER_UP_GOLD);
      this.stats.addXp(r, RUNNER_UP_XP);
    }
    this.stats.save();

    const lines: string[] = ['🏟️ **TURNIEJ ZAKOŃCZONY**', '', '**Ranking:**'];
    for (let i = 0; i < ranking.length; i++) {
      const [id, score] = ranking[i];
      lines.push(`${i + 1}. <@${id}> — **${score}** W`);
    }
    if (winnerEntry) {
      lines.push(
        '',
        `🏆 **Mistrz Areny:** <@${winnerEntry[0]}> (+${WINNER_GOLD} zł, +${WINNER_XP} PvP XP, +${WINNER_COMBAT_XP} combat XP).`,
      );
    }
    if (runnerUpEntry) {
      lines.push(
        `🥈 **Runner-up:** <@${runnerUpEntry[0]}> (+${RUNNER_UP_GOLD} zł, +${RUNNER_UP_XP} PvP XP).`,
      );
    }
    lines.push('', 'Następna arena jutro o 18:10.');

    await postBattleSummary(t.thread, lines.join('\n').slice(0, 1900));
    await closeBattleThread(t.thread, '🏁 Arena zakończona — wątek archiwizujemy.');
    this.tournament = null;
  }

  private fmtBoard(state: BattleState): string {
    return state.combatants
      .map((c) => `${c.name}: ${c.hp}/${c.maxHp} HP`)
      .join(' | ');
  }

  private fmtStandings(t: ArenaTournament): string {
    const sorted = [...t.scores.entries()].sort((a, b) => b[1] - a[1]);
    return (
      '_Aktualny ranking:_ ' +
      sorted.map(([id, w]) => `<@${id}>: ${w}W`).join(' · ')
    );
  }

  private async disableAnnounceButton(evt: ArenaEvent): Promise<void> {
    if (!evt.announceMsgId) return;
    await disableMessageComponents(this.client, evt.channelId, evt.announceMsgId);
  }
}
