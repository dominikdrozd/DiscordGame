import {
  type ButtonInteraction,
  type Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { PartyService } from '../services/party.js';
import { ExpeditionService } from '../services/expedition.service.js';
import { applyAttack } from './combat.js';
import { buildPlayerCombatant } from './player-combatant.js';
import { errMsg } from '../../../utils.js';

const TICK_MS = 60_000;
/** Codzienna godzina ogłoszenia areny (lokalna strefa). */
const ARENA_HOUR = 18;
/** Minuta w godzinie. */
const ARENA_MINUTE = 10;
/** Okno rejestracji od ogłoszenia do startu turnieju. */
const REGISTRATION_WINDOW_MS = 15 * 60_000;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 16;

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

function hasSendable(c: unknown): c is { send: (payload: unknown) => Promise<unknown> } {
  if (!c || typeof c !== 'object') return false;
  if (!('send' in c)) return false;
  return typeof (c as { send: unknown }).send === 'function';
}

/** Najbliższy timestamp ARENA_HOUR:ARENA_MINUTE lokalnie po `now`. */
function nextArenaSlot(now: number): number {
  const d = new Date(now);
  const today = new Date(d);
  today.setHours(ARENA_HOUR, ARENA_MINUTE, 0, 0);
  if (today.getTime() > now) return today.getTime();
  const tomorrow = new Date(d);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(ARENA_HOUR, ARENA_MINUTE, 0, 0);
  return tomorrow.getTime();
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

interface SimCombatant {
  name: string;
  hp: number;
  maxHp: number;
  damageBonus: number;
  defenseBonus?: number;
  critBonus?: number;
  speed?: number;
  defending: boolean;
  potionsLeft: number;
  consumables?: Record<string, number>;
}

/**
 * Symulacja 1v1 duela bez human input — obaj atakują się aż jeden padnie.
 * Zwraca id zwycięzcy + log linii. Używane w arenie zamiast interaktywnych
 * duels (gracze nie muszą być online między rundami).
 *
 * Mechanika: każdą rundę obaj atakują równolegle przez `applyAttack`.
 * Speed nie wpływa (round = jednoczesne ataki). Limit 50 rund — zbyt
 * długie walki kończy random tiebreak (wyższe HP wygrywa).
 */
function simulateDuel(
  a: PlayerStats,
  b: PlayerStats,
  stats: PlayerStatsService,
): { winnerId: string; lines: string[] } {
  const ca = buildPlayerCombatant(stats, a);
  const cb = buildPlayerCombatant(stats, b);
  const lines: string[] = [`⚔️ **${a.name}** vs **${b.name}**`];
  for (let round = 1; round <= 50; round++) {
    if (ca.hp <= 0 || cb.hp <= 0) break;
    lines.push(`_R${round}:_`);
    lines.push('  ' + applyAttack(ca, cb));
    if (cb.hp <= 0) break;
    lines.push('  ' + applyAttack(cb, ca));
  }
  let winnerId: string;
  if (ca.hp <= 0 && cb.hp <= 0) {
    // Remis sędziowski — wygrywa ten z wyższym damageBonus.
    winnerId = ca.damageBonus >= cb.damageBonus ? a.id : b.id;
    lines.push(`⚖️ Remis HP — wygrywa szybszy: **${winnerId === a.id ? a.name : b.name}**.`);
  } else if (ca.hp <= 0) {
    winnerId = b.id;
    lines.push(`🏆 Zwycięzca: **${b.name}**`);
  } else if (cb.hp <= 0) {
    winnerId = a.id;
    lines.push(`🏆 Zwycięzca: **${a.name}**`);
  } else {
    // Hit rund-cap: wygrywa wyższe HP %.
    const ratioA = ca.hp / ca.maxHp;
    const ratioB = cb.hp / cb.maxHp;
    winnerId = ratioA >= ratioB ? a.id : b.id;
    lines.push(`⏱️ Time-out — wygrywa wyższe HP%: **${winnerId === a.id ? a.name : b.name}**.`);
  }
  return { winnerId, lines };
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Arena Service — codzienny turniej PvP o 18:00.
 *
 * Flow:
 *  1. Tick co 60s: gdy czas >= 18:00 i nie było jeszcze ogłoszenia
 *     dzisiaj → spawn announcement.
 *  2. 15 min okno rejestracji (button "Dołącz" + "Anuluj wyprawę").
 *  3. Po oknie: jeśli ≥2 zapisanych — single-elim bracket, każdy duel
 *     SYMULOWANY (no human input). Buty per match w wątku.
 *  4. Champion: gold + XP + combat XP. 2nd place: częściowy reward.
 *
 * Wymóg: gracze na ekspedycji **nie mogą się zapisać** — przycisk
 * "Anuluj wyprawę" pozwala lider party / solo gracz przerwać aktualną
 * wyprawę żeby dołączyć.
 */
export class ArenaService {
  private timer: NodeJS.Timeout | null = null;
  private pendingEvent: ArenaEvent | null = null;
  private nextSpawnAt: number = 0;
  /** Zapobiega podwójnemu spawnowaniu w tej samej dobie. */
  private lastSpawnDay: string = '';

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly expeditions: ExpeditionService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextSpawnAt = nextArenaSlot(Date.now());
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

  /** Public — dla ręcznego trigger via admin command. */
  async forceSpawn(): Promise<void> {
    await this.spawnAnnouncement();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    if (this.pendingEvent && now >= this.pendingEvent.registrationEndsAt) {
      const evt = this.pendingEvent;
      this.pendingEvent = null;
      await this.tryStartTournament(evt);
    }
    if (now >= this.nextSpawnAt) {
      this.nextSpawnAt = nextArenaSlot(now);
      const dayKey = new Date(now).toISOString().slice(0, 10);
      if (this.lastSpawnDay !== dayKey) {
        this.lastSpawnDay = dayKey;
        await this.spawnAnnouncement();
      }
    }
  }

  private async spawnAnnouncement(): Promise<void> {
    const channelId = process.env.ARENA_CHANNEL_ID ?? process.env.WORLD_BOSS_CHANNEL_ID;
    if (!channelId) {
      console.warn(
        '[arena] ARENA_CHANNEL_ID (ani WORLD_BOSS_CHANNEL_ID) nie ustawione — pomijam announcement. Ustaw w .env żeby ogłaszać arenę.',
      );
      return;
    }
    if (this.pendingEvent) return;

    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) {
      console.error(`[arena] channel ${channelId} unreachable`);
      return;
    }

    // Pingujemy wszystkich graczy z profilem żeby dostali notyfikację —
    // inaczej ogłoszenie utonie w kanale i nikt go nie zobaczy.
    const allPlayers = this.stats.list();
    const mentions = allPlayers.map((p) => `<@${p.id}>`);
    // Discord 2000 char limit — przy >50 graczach dzielimy na batche.
    const MENTION_BATCH = 50;

    const registrationEndsAt = Date.now() + REGISTRATION_WINDOW_MS;
    const sent = await channel
      .send({
        content: [
          '🏟️ **ARENA OTWARTA!**',
          mentions.slice(0, MENTION_BATCH).join(' '),
          `Codzienny turniej PvP. Rejestracja **${Math.round(REGISTRATION_WINDOW_MS / 60_000)} min**.`,
          `Min ${MIN_PARTICIPANTS}, max ${MAX_PARTICIPANTS} graczy. Single-elimination — wygrywa jeden.`,
          `🏆 **Nagroda dla mistrza:** ${WINNER_GOLD} zł + ${WINNER_XP} PvP XP + ${WINNER_COMBAT_XP} combat XP.`,
          `🥈 **Runner-up:** ${RUNNER_UP_GOLD} zł + ${RUNNER_UP_XP} PvP XP.`,
          '',
          '_Gracze na ekspedycji nie mogą startować — kliknij **Anuluj wyprawę** żeby się zapisać._',
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1900),
        components: [buildAnnounceRow()],
      })
      .catch(() => null);
    // Dodatkowe batches mentions jeśli > 50 graczy.
    for (let i = MENTION_BATCH; i < mentions.length; i += MENTION_BATCH) {
      await channel
        .send({ content: mentions.slice(i, i + MENTION_BATCH).join(' ').slice(0, 1900) })
        .catch(() => {});
    }

    const announceMsgId =
      sent && typeof sent === 'object' && 'id' in sent && typeof sent.id === 'string'
        ? sent.id
        : undefined;

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
  }

  private async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const evt = this.pendingEvent;
    if (!evt) {
      await interaction
        .reply({
          content: 'Rejestracja zamknięta — następna arena jutro o 18:10.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    const userId = interaction.user.id;
    const player = this.stats.get(
      userId,
      interaction.user.globalName ?? interaction.user.username,
    );
    if (player.activeExpedition) {
      await interaction
        .reply({
          content:
            '🚫 Jesteś na wyprawie — kliknij **Anuluj wyprawę** żeby się wypisać i dołączyć do areny.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    if (evt.participants.has(userId)) {
      await interaction
        .reply({ content: '✅ Już zapisany.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      await interaction
        .reply({ content: `Slot pełny (max ${MAX_PARTICIPANTS}).`, ephemeral: true })
        .catch(() => {});
      return;
    }
    evt.participants.add(userId);
    await interaction
      .reply({
        content: `🏟️ Dołączasz! Zapisanych: ${evt.participants.size}/${MAX_PARTICIPANTS}.`,
        ephemeral: true,
      })
      .catch(() => {});
  }

  private async handleCancelExpedition(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    if (!player.activeExpedition) {
      await interaction
        .reply({ content: 'Nie jesteś na żadnej wyprawie.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const partyId = player.activeExpedition.partyId;
    if (partyId) {
      const partyEntity = this.party.get(partyId);
      if (partyEntity && partyEntity.leaderId !== userId) {
        await interaction
          .reply({
            content: `🚫 Tylko **lider party** (<@${partyEntity.leaderId}>) może anulować wyprawę party.`,
            ephemeral: true,
          })
          .catch(() => {});
        return;
      }
      // Lider anuluje dla całego party.
      const members = partyEntity ? partyEntity.members : [userId];
      for (const memberId of members) {
        const m = this.stats.get(memberId);
        m.activeExpedition = null;
      }
      this.stats.save();
      await interaction
        .reply({
          content: `✅ Wyprawa party anulowana (${members.length} graczy zwolnionych). Możecie dołączyć do areny.`,
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    // Solo expedition — gracz sam anuluje.
    player.activeExpedition = null;
    this.stats.save();
    await interaction
      .reply({
        content: '✅ Twoja solo-wyprawa anulowana. Możesz dołączyć do areny.',
        ephemeral: true,
      })
      .catch(() => {});
  }

  /** Public — testowalna logika turnieju (sim, bez Discord). */
  runTournament(participantIds: string[]): {
    winnerId: string;
    runnerUpId?: string;
    rounds: { matchups: Array<{ a: string; b: string; winner: string; lines: string[] }> }[];
  } {
    let alive = shuffle([...participantIds]);
    const rounds: { matchups: Array<{ a: string; b: string; winner: string; lines: string[] }> }[] = [];
    let runnerUpId: string | undefined;
    while (alive.length > 1) {
      const matchups: Array<{ a: string; b: string; winner: string; lines: string[] }> = [];
      const next: string[] = [];
      for (let i = 0; i < alive.length; i += 2) {
        if (i + 1 >= alive.length) {
          // bye — nieparzysta liczba, ostatni player przechodzi za darmo
          next.push(alive[i]);
          continue;
        }
        const aId = alive[i];
        const bId = alive[i + 1];
        const a = this.stats.get(aId);
        const b = this.stats.get(bId);
        const result = simulateDuel(a, b, this.stats);
        matchups.push({ a: aId, b: bId, winner: result.winnerId, lines: result.lines });
        next.push(result.winnerId);
        if (alive.length === 2) {
          // To finał — przegrany jest runner-up.
          runnerUpId = result.winnerId === aId ? bId : aId;
        }
      }
      rounds.push({ matchups });
      alive = next;
    }
    return { winnerId: alive[0], runnerUpId, rounds };
  }

  async tryStartTournament(evt: ArenaEvent): Promise<void> {
    const channel = await this.client.channels.fetch(evt.channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) return;

    if (evt.participants.size < MIN_PARTICIPANTS) {
      await channel
        .send(
          `🏟️ Arena anulowana — za mało chętnych (${evt.participants.size}/${MIN_PARTICIPANTS}). Spotkamy się jutro.`,
        )
        .catch(() => {});
      await this.disableAnnounceButton(evt);
      return;
    }

    if (!('threads' in channel) || typeof (channel as { threads?: unknown }).threads !== 'object') {
      await channel.send('Nie mogę otworzyć wątku areny — kanał nie wspiera wątków.').catch(() => {});
      return;
    }
    const threadsApi = (channel as { threads: { create?: (opts: unknown) => Promise<unknown> } })
      .threads;
    if (!threadsApi.create) return;
    const thread = await threadsApi
      .create({
        name: `🏟️ Arena ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch(() => null);
    if (!thread || typeof thread !== 'object' || !('send' in thread)) return;
    const tt = thread as { send: (payload: unknown) => Promise<unknown> };

    await this.disableAnnounceButton(evt);

    const result = this.runTournament([...evt.participants]);

    const opening = [
      `🏟️ **Arena — turniej rozpoczęty!**`,
      `Uczestników: **${evt.participants.size}**.`,
      `Single-elimination, każda walka symulowana stat-based.`,
    ].join('\n');
    await tt.send({ content: opening }).catch(() => {});

    for (let r = 0; r < result.rounds.length; r++) {
      const round = result.rounds[r];
      await tt
        .send({ content: `**═══ Runda ${r + 1} ═══**` })
        .catch(() => {});
      for (const m of round.matchups) {
        await tt.send({ content: m.lines.join('\n').slice(0, 1900) }).catch(() => {});
      }
    }

    const winner = this.stats.get(result.winnerId);
    this.stats.addGold(winner, WINNER_GOLD);
    this.stats.addXp(winner, WINNER_XP);
    this.stats.addSkillXp(winner, 'combat', WINNER_COMBAT_XP);
    if (result.runnerUpId) {
      const runner = this.stats.get(result.runnerUpId);
      this.stats.addGold(runner, RUNNER_UP_GOLD);
      this.stats.addXp(runner, RUNNER_UP_XP);
    }
    this.stats.save();

    const closing = [
      `🏆 **Mistrz Areny:** ${winner.name}!`,
      `Nagroda od miasta: **${WINNER_GOLD} zł + ${WINNER_XP} PvP XP + ${WINNER_COMBAT_XP} combat XP**.`,
      result.runnerUpId
        ? `🥈 Runner-up: **${this.stats.get(result.runnerUpId).name}** (+${RUNNER_UP_GOLD} zł, +${RUNNER_UP_XP} XP).`
        : '',
      '',
      'Następna arena jutro o 18:10.',
    ]
      .filter(Boolean)
      .join('\n');
    await tt.send({ content: closing }).catch(() => {});
  }

  private async disableAnnounceButton(evt: ArenaEvent): Promise<void> {
    if (!evt.announceMsgId) return;
    const channel = await this.client.channels.fetch(evt.channelId).catch(() => null);
    if (!channel || !('messages' in channel)) return;
    const msgs = (channel as { messages?: { fetch?: (id: string) => Promise<unknown> } }).messages;
    if (!msgs?.fetch) return;
    const msg = await msgs.fetch(evt.announceMsgId).catch(() => null);
    if (!msg || typeof msg !== 'object' || !('edit' in msg)) return;
    const edit = (msg as { edit?: (payload: unknown) => Promise<unknown> }).edit;
    if (!edit) return;
    await edit.call(msg, { components: [] }).catch(() => {});
  }
}
