import { randomUUID } from 'node:crypto';
import type { Client, ButtonInteraction } from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { BattleStore } from './battle-store.js';
import { PartyService, type Party } from '../services/party.js';
import { rollLootMany } from '../services/loot.js';
import { ITEMS } from '../services/items.js';
import { EXPEDITIONS, type ExpeditionDef } from './encounters.js';
import { randomAmbushMob, ambushTierForLevel, type RandomAmbushOpts } from '../mobs/index.js';
import { errMsg } from '../../../utils.js';
import { chat } from '../../../managers/chat.manager.js';

function buildAmbushOpts(def: ExpeditionDef | undefined, combatLvl: number): RandomAmbushOpts {
  const opts: RandomAmbushOpts = {};
  if (def?.ambushMobIds && def.ambushMobIds.length > 0) {
    opts.allowedIds = [...def.ambushMobIds];
  }
  // Mob trzymamy na bazowym tierze (1) — `applyExpeditionTier` aplikuje
  // mnożnik liniowy `expedition.tier` na hp/dmg/def/primary. Bez ekspedycji
  // (np. testy bez def) wracamy do level-based fallback z TIER_MULTIPLIERS.
  if (!def) opts.tier = ambushTierForLevel(combatLvl);
  return opts;
}

/**
 * Liczba mobów w solo-ambushu na podstawie `combatPower` gracza. Słabsi
 * gracze (power < 100) zawsze dostają 1 moba; przy 800+ jest ~40% szans
 * na 2 i ~15% na 3. Liniowy lerp w przedziale 100–800. Cap=3 — solo gracz
 * przeciw 4 mobom = certain death, nie chcemy tego nawet endgame.
 */
function rollAmbushMobCount(power: number, rand: () => number = Math.random): number {
  const clamped = Math.max(100, Math.min(800, power));
  const t = (clamped - 100) / 700; // 0..1
  const chance3 = 0.15 * t;
  const chance2 = 0.4 * t;
  const roll = rand();
  if (roll < chance3) return 3;
  if (roll < chance3 + chance2) return 2;
  return 1;
}

/**
 * Skaluje staty ambush moba przez tier ekspedycji (×1 dla T1, ×5 dla T5).
 * Liniowo, niezależnie od `TIER_MULTIPLIERS` — żeby T1 wyprawy były tutorial
 * easy a T5 były genuine endgame challenge. Dotyczy hp/maxHp/dmg/def/primary.
 * Generic <T extends Combatant> żeby zachować ewentualne dodatkowe pola
 * (np. id z `Combatant & { id }` zwracane przez `mob.toCombatant`).
 */
function applyExpeditionTier<T extends Combatant>(c: T, tier: number): T {
  if (tier <= 1) return c;
  const hp = Math.round(c.hp * tier);
  const out: T = {
    ...c,
    hp,
    maxHp: hp,
    damageBonus: Math.round(c.damageBonus * tier),
  };
  if (c.defenseBonus !== undefined) {
    out.defenseBonus = Math.round(c.defenseBonus * tier);
  }
  if (c.primary) {
    out.primary = {
      str: Math.round(c.primary.str * tier),
      agi: Math.round(c.primary.agi * tier),
      wit: Math.round(c.primary.wit * tier),
      int: Math.round(c.primary.int * tier),
    };
    out.spellPower = out.primary.int * 2;
  }
  return out;
}
import {
  type BattleCombatant,
  type BattleState,
  aliveEnemies,
  findCombatant,
  humansAlive,
} from './battle-state.js';
import type { Combatant } from './combat.js';
import { resolveBattleRound } from './combat-battle.js';
import { chooseAiAction } from './ai.js';
import { buildPlayerCombatant } from './player-combatant.js';
import { buildPanelOpenerRow, buildTargetRow } from '../ui/battle-buttons.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
  recreateBattleThread,
} from './battle-helpers.js';

const AMBUSH_CHECK_INTERVAL_MS = parseInt(process.env.AMBUSH_CHECK_INTERVAL_MS || '300000', 10);
const AMBUSH_CHANCE = parseFloat(process.env.AMBUSH_CHANCE || '0.25');
/**
 * Maksymalny czas na zakończenie ambushu — 24h. Wcześniej było 10min ale
 * gracz mógł przegapić walkę i stracić wyprawę przez mocno opóźnioną
 * notyfikację. Przez ten czas wyprawa jest zamrożona (`ambushedSince`),
 * więc długi timeout nie szkodzi tempu rozgrywki.
 */
const AMBUSH_TIMEOUT_MS = 24 * 60 * 60_000;

interface AmbushBattleState extends BattleState {
  expedition: { destination: string; channelId: string };
  timeoutHandle?: NodeJS.Timeout;
}

function hasThreadId(t: unknown): t is { id: string } {
  return !!t && typeof t === 'object' && 'id' in t && typeof (t as { id: unknown }).id === 'string';
}

export class AmbushService {
  private timer: NodeJS.Timeout | null = null;
  private readonly visited = new Set<string>();
  private readonly states = new Map<string, AmbushBattleState>();

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
    private readonly battleStore: BattleStore,
    private readonly logAmbush: (playerId: string, line: string) => void = () => {},
  ) {}

  /**
   * Wczytuje aktywne ambush battles z Mongo i odtwarza in-memory state.
   * Wywoływane raz na starcie (po `client.once('ready')`). Stale battles
   * (>AMBUSH_TIMEOUT_MS od createdAt) są od razu finished'owane jako timeout.
   *
   * Thread NIE jest odtwarzany od razu — czeka na klik "Wróć do walki".
   * Timeout handler jest re-scheduled z pozostałym czasem.
   */
  async hydrate(): Promise<void> {
    const loaded = await this.battleStore.loadActive();
    let restored = 0;
    let staleSkipped = 0;
    const now = Date.now();
    for (const { state, doc } of loaded) {
      if (doc.type !== 'ambush') continue; // inne typy — phase 3
      if (now - doc.createdAt > AMBUSH_TIMEOUT_MS) {
        await this.battleStore.finish(doc._id, { draw: true });
        staleSkipped += 1;
        continue;
      }
      if (!doc.expedition) continue;
      const ambushState = state as AmbushBattleState;
      ambushState.expedition = doc.expedition;
      ambushState.parentChannelId = doc.parentChannelId;
      this.states.set(state.id, ambushState);

      const elapsed = now - doc.createdAt;
      const remaining = Math.max(60_000, AMBUSH_TIMEOUT_MS - elapsed);
      ambushState.timeoutHandle = setTimeout(() => {
        this.timeoutAmbush(ambushState).catch((e) =>
          console.error('[ambush] hydrate timeout fail:', errMsg(e)),
        );
      }, remaining);
      ambushState.timeoutHandle.unref?.();
      restored += 1;
    }
    console.log(
      `[ambush] hydrate: ${restored} active battles restored, ${staleSkipped} stale skipped`,
    );
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.error('[ambush] tick fail:', errMsg(e)));
    }, AMBUSH_CHECK_INTERVAL_MS);
    this.timer.unref?.();
    console.log(
      `[ambush] loop started (every ${AMBUSH_CHECK_INTERVAL_MS / 1000}s, chance ${AMBUSH_CHANCE})`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Zwraca aktywny ambush state gracza (jeśli jest). Używane przez
   * ExpeditionService żeby pokazać "Wróć do walki" gdy gracz zamknął
   * widok wyprawy podczas trwającego ambushu.
   */
  getActiveStateForPlayer(playerId: string): AmbushBattleState | undefined {
    for (const state of this.states.values()) {
      if (state.finished) continue;
      const me = state.combatants.find((c) => c.team === 0 && c.id === playerId);
      if (me && me.hp > 0) return state;
    }
    return undefined;
  }

  /**
   * Re-prompt gracza w wątku ambushu — przydatne gdy odszedł od walki
   * i wraca przez "Wróć do walki" w widoku wyprawy. Wysyła panel akcji
   * od nowa do oryginalnego wątku.
   *
   * Fallback: jeśli stary wątek został usunięty (lub niedostępny —
   * `send` rzuca), odtwarzamy nowy thread w parent channelu i migrujemy
   * `state` do niego (re-key w `states` Map, czyszczenie starych
   * `promptMessageIds`). Stan walki (HP/potki/skille/buffy/cooldowny)
   * zachowany — Discord traci tylko historię chatu.
   */
  async resumeForPlayer(playerId: string): Promise<{ ok: boolean; threadId?: string }> {
    const state = this.getActiveStateForPlayer(playerId);
    if (!state) return { ok: false };

    // Hydrated state — `state.thread === null` (po `hydrate()` z Mongo).
    // Recreate thread od razu, bez próby send-fail-fallback.
    if (state.thread === null) {
      const newThread = await this.recreateThreadFor(state, playerId);
      if (!newThread || !hasThreadId(newThread)) {
        console.error('[ambush] resume fail (hydrated): parent channel unreachable');
        return { ok: false };
      }
      this.states.delete(state.id);
      state.id = newThread.id;
      state.thread = newThread;
      state.promptMessageIds.clear();
      this.states.set(newThread.id, state);
      await this.battleStore.updateThreadId(state._battleId, newThread.id);

      try {
        await chat.send(
          state.thread,
          `⚔️ <@${playerId}> wraca do walki — aktualny stan:\n${this.fmtBoard(state)}`,
        );
        await this.promptHumans(state);
      } catch (e) {
        console.error('[ambush] resume hydrated promptHumans fail:', errMsg(e));
        return { ok: false };
      }
      return { ok: true, threadId: newThread.id };
    }

    const tryUnarchive = async (): Promise<void> => {
      if (typeof state.thread.setArchived === 'function') {
        await state.thread.setArchived(false).catch(() => {});
      }
    };
    const sendBoard = async (): Promise<boolean> => {
      const sent = await chat.send(
        state.thread,
        `⚔️ <@${playerId}> wraca do walki — aktualny stan:\n${this.fmtBoard(state)}`,
      );
      return sent !== null;
    };

    await tryUnarchive();
    let alive = await sendBoard();

    if (!alive) {
      // Wątek zniknął — odtwórz nowy w parent channelu, migruj state.
      const newThread = await this.recreateThreadFor(state, playerId);
      if (!newThread || !hasThreadId(newThread)) {
        console.error('[ambush] resume fail: thread gone, parent channel unreachable');
        return { ok: false };
      }
      this.states.delete(state.id);
      state.id = newThread.id;
      state.thread = newThread;
      state.promptMessageIds.clear();
      this.states.set(newThread.id, state);
      await this.battleStore.updateThreadId(state._battleId, newThread.id);
      alive = await sendBoard();
      if (!alive) return { ok: false };
    }

    try {
      await this.promptHumans(state);
    } catch (e) {
      console.error('[ambush] resume promptHumans fail:', errMsg(e));
    }
    return { ok: true, threadId: state.thread.id };
  }

  /**
   * Forced final encounter na koniec ekspedycji — triggerowany przez
   * `ExpeditionService.handleClaim` gdy gracz próbuje odebrać loot.
   * Tworzy ambush identyczny z random ambushem, ale gwarantowany.
   * Po wygranej `finishAmbush` ustawia `activeExpedition.finalFightDone`,
   * pozwalając kolejnemu klikowi "Zbierz" awardować rewardy.
   */
  async triggerForcedFinaleFor(playerId: string): Promise<boolean> {
    if (this.hasActiveAmbushForPlayer(playerId)) return false;
    const player = this.stats.get(playerId);
    const exp = player.activeExpedition;
    if (!exp) return false;
    if (exp.partyId) {
      const party = this.party.get(exp.partyId);
      if (!party) return false;
      await this.triggerPartyAmbush(party);
    } else {
      await this.triggerAmbush(playerId);
    }
    return true;
  }

  /**
   * Odtwarza wątek ambushu w parent channelu po jego usunięciu.
   * Deleguje do generic `recreateBattleThread` w `battle-helpers.ts`.
   */
  private async recreateThreadFor(
    state: AmbushBattleState,
    playerId: string,
  ): Promise<unknown> {
    const players = state.combatants
      .filter((c) => c.team === 0)
      .map((c) => `<@${c.id}>`)
      .join(' ');
    return recreateBattleThread(this.client, state, {
      threadName: `Ambush (resume): ${playerId}`,
      announceText: `⚔️ ${players} — wątek ambushu został odtworzony, kontynuujcie walkę!`,
    });
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    await routeBattleInteraction<AmbushBattleState>(interaction, {
      getState: (id) => this.states.get(id),
      onChoiceRecorded: (state) => this.maybeResolve(state),
      notMineMessage: 'To nie twój ambush.',
      alreadyDeadMessage: 'Już nie żyjesz w tym ambushu.',
    });
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const handledParties = new Set<string>();
    for (const player of this.stats.list()) {
      const exp = player.activeExpedition;
      if (!exp || !exp.channelId) continue;
      if (exp.endsAt <= now) continue;
      // skip jeśli ten gracz/party już jest w trakcie aktywnego ambush
      if (this.hasActiveAmbushForPlayer(player.id)) continue;
      // dedupe per party
      if (exp.partyId) {
        if (handledParties.has(exp.partyId)) continue;
        handledParties.add(exp.partyId);
      }
      const visitKey = `${exp.partyId ?? player.id}:${exp.endsAt}:${Math.floor(now / AMBUSH_CHECK_INTERVAL_MS)}`;
      if (this.visited.has(visitKey)) continue;
      if (Math.random() > AMBUSH_CHANCE) continue;
      this.visited.add(visitKey);
      if (exp.partyId) {
        const party = this.party.get(exp.partyId);
        if (party) await this.triggerPartyAmbush(party);
      } else {
        await this.triggerAmbush(player.id);
      }
    }
  }

  /** True jeśli któryś niezakończony ambush state ma tego gracza po stronie team 0. */
  private hasActiveAmbushForPlayer(playerId: string): boolean {
    for (const state of this.states.values()) {
      if (state.finished) continue;
      if (state.combatants.some((c) => c.team === 0 && c.id === playerId && c.hp > 0)) return true;
    }
    return false;
  }

  private async triggerPartyAmbush(party: Party): Promise<void> {
    const members = party.members
      .map((id) => this.stats.get(id))
      .filter((p) => p.activeExpedition && p.activeExpedition.channelId);
    if (members.length === 0) return;
    const channelId = members[0].activeExpedition!.channelId!;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const announcement = await channel
      .send(
        `🏹 ${members.map((m) => `<@${m.id}>`).join(' ')} — z krzaków wyskakuje banda — broń się!`,
      )
      .catch(() => null);
    if (!announcement) return;
    const thread = await announcement
      .startThread({
        name: `Ambush: party (${members.length})`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch(() => null);
    if (!thread) return;

    const playerCombatants: BattleCombatant[] = members.map((p) => ({
      ...buildPlayerCombatant(this.stats, p),
      team: 0,
      controller: 'human',
    }));
    const mobCount = Math.min(4, members.length);
    const maxCombatLvl = Math.max(...members.map((m) => m.skills.combat.level));
    const expDef = EXPEDITIONS[members[0].activeExpedition!.destination];
    const expTier = expDef?.tier ?? 1;
    const mobCombatants: BattleCombatant[] = [];
    for (let i = 0; i < mobCount; i++) {
      const mob = randomAmbushMob(buildAmbushOpts(expDef, maxCombatLvl));
      const raw = mob.toCombatant(`${Date.now()}_${i + 1}`);
      const scaled = applyExpeditionTier(raw, expTier);
      mobCombatants.push({
        ...scaled,
        team: 1,
        controller: 'ai',
      });
    }

    const expDestination = members[0].activeExpedition!.destination;
    const ambushStart = Date.now();
    // Zamrażamy czas wyprawy — `endsAt` nie liczy się aż do finishu/timeoutu.
    for (const m of members) {
      if (m.activeExpedition) m.activeExpedition.ambushedSince = ambushStart;
    }
    this.stats.save();
    const state: AmbushBattleState = {
      _battleId: randomUUID(),
      parentChannelId: channelId,
      id: thread.id,
      thread,
      combatants: [...playerCombatants, ...mobCombatants],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      expedition: { destination: expDestination, channelId },
    };
    this.states.set(thread.id, state);
    await this.battleStore.create(state, 'ambush', {
      parentChannelId: channelId,
      expedition: { destination: expDestination, channelId },
    });

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) =>
        console.error('[ambush] party timeout fail:', errMsg(e)),
      );
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    const mobLine = mobCombatants.map((m) => `**${m.name}** (${m.hp} HP)`).join(', ');
    await chat.send(
      thread,
      `Wrogowie: ${mobLine}. Każdy członek party klika dla siebie — runda się rozliczy gdy wszyscy podadzą akcje. **Wyprawa zatrzymana** — dokończcie walkę w ciągu **${Math.round(AMBUSH_TIMEOUT_MS / 60_000 / 60)} h** lub przepada.`,
    );
    await this.promptHumans(state);
  }

  private async triggerAmbush(playerId: string): Promise<void> {
    const player = this.stats.get(playerId);
    const exp = player.activeExpedition;
    if (!exp?.channelId) return;
    const channel = await this.client.channels.fetch(exp.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const announcement = await channel
      .send(`🏹 <@${playerId}> Z krzaków wyskakuje napastnik — broń się!`)
      .catch(() => null);
    if (!announcement) return;

    let thread: any;
    try {
      thread = await announcement.startThread({
        name: `Ambush: ${player.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
    } catch {
      return;
    }
    if (!thread) return;

    const playerRaw = buildPlayerCombatant(this.stats, player);
    const playerCombatant: BattleCombatant = {
      ...playerRaw,
      team: 0,
      controller: 'human',
    };
    const expDef = EXPEDITIONS[exp.destination];
    const expTier = expDef?.tier ?? 1;
    const mobCount = rollAmbushMobCount(this.stats.combatPower(player));
    const mobCombatants: BattleCombatant[] = [];
    for (let i = 0; i < mobCount; i++) {
      const mob = randomAmbushMob(buildAmbushOpts(expDef, player.skills.combat.level));
      const scaled = applyExpeditionTier(mob.toCombatant(`${Date.now()}_${i + 1}`), expTier);
      mobCombatants.push({
        ...scaled,
        team: 1,
        controller: 'ai',
      });
    }

    const ambushStart = Date.now();
    // Zamrażamy czas wyprawy gracza — `endsAt` nie liczy się przez ambush.
    if (player.activeExpedition) player.activeExpedition.ambushedSince = ambushStart;
    this.stats.save();

    const state: AmbushBattleState = {
      _battleId: randomUUID(),
      parentChannelId: exp.channelId,
      id: thread.id,
      thread,
      combatants: [playerCombatant, ...mobCombatants],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      expedition: { destination: exp.destination, channelId: exp.channelId },
    };
    this.states.set(thread.id, state);
    await this.battleStore.create(state, 'ambush', {
      parentChannelId: exp.channelId,
      expedition: { destination: exp.destination, channelId: exp.channelId },
    });

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) => console.error('[ambush] timeout fail:', errMsg(e)));
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    const mobLine = mobCombatants
      .map((m) => `**${m.name}** (${m.hp} HP, +${m.damageBonus} dmg)`)
      .join(', ');
    const intro =
      mobCount === 1
        ? `${mobLine} blokuje Ci drogę!`
        : `Z krzaków wyskakuje ${mobCount} napastników: ${mobLine}!`;
    await chat.send(
      thread,
      `${intro} **Wyprawa zatrzymana** — dokończ walkę w ciągu **${Math.round(AMBUSH_TIMEOUT_MS / 60_000 / 60)} h** lub przepada.`,
    );
    await this.promptHumans(state);
  }

  private async maybeResolve(state: AmbushBattleState): Promise<void> {
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    for (const c of state.combatants) {
      if (c.controller !== 'ai' || c.hp <= 0 || state.pending.has(c.id)) continue;
      state.pending.set(c.id, chooseAiAction(state, c));
    }
    for (const [, msgId] of state.promptMessageIds) {
      try {
        const m = await state.thread.messages.fetch(msgId).catch(() => null);
        if (m) await chat.edit(m, { components: [buildPanelOpenerRow(state.id, true)] });
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);
    // Snapshot persisted PRZED round-summary message — eliminuje race "summary widoczny, crash przed snapshot".
    await this.battleStore.snapshot(state);

    // Log walki — zawsze, też dla ostatniej rundy gdy ktoś ginie.
    if (result.lines.length > 0) {
      await chat.send(
        state.thread,
        [...result.lines, '', this.fmtBoard(state)].join('\n').slice(0, 1900),
      );
    }

    if (result.finished) {
      await this.finishAmbush(state, result);
      return;
    }

    await chat.send(state.thread, `⏭ Runda ${state.roundNumber}`);
    await this.promptHumans(state);
  }

  private async finishAmbush(
    state: AmbushBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
    await this.battleStore.finish(state._battleId, {
      winnerTeam: result.winnerTeam,
      draw: result.draw,
    });
    syncConsumablesAfterBattle(this.stats, state);
    const playerCombatants = state.combatants.filter((c) => c.team === 0);
    const def = EXPEDITIONS[state.expedition.destination];

    if (result.draw || result.winnerTeam === 1) {
      for (const pc of playerCombatants) {
        const p = this.stats.get(pc.id, pc.name);
        p.activeExpedition = null;
        this.logAmbush(
          p.id,
          `💀 Padłeś w ambushu — wyprawa do ${def?.name ?? state.expedition.destination} przerwana.`,
        );
      }
      this.stats.save();
      await postBattleSummary(
        state.thread,
        `💀 **Ambush — porażka!** Drużyna pada. Wyprawa do **${def?.name ?? state.expedition.destination}** przepada dla wszystkich.`,
      );
    } else {
      const lines: string[] = ['🏆 **Ambush — zwycięstwo!** Banda pokonana, łupy:'];
      const now = Date.now();
      for (const pc of playerCombatants) {
        const p = this.stats.get(pc.id, pc.name);
        const drops = def?.lootTable ? rollLootMany(def.lootTable, p.skills.combat.level, 1) : [];
        const dropLabels: string[] = [];
        for (const d of drops) {
          this.stats.addResource(p, d.itemId, d.qty);
          dropLabels.push(`${ITEMS[d.itemId]?.name ?? d.itemId} ×${d.qty}`);
        }
        const leveled = this.stats.addSkillXp(p, 'combat', 25);
        lines.push(
          `• <@${p.id}>: ${dropLabels.length ? dropLabels.join(', ') : '(nic)'} (+25 XP combat${leveled ? ' 🎉 LEVEL UP!' : ''})`,
        );
        // Wydłuż czas wyprawy o czas trwania walki — gracz nie traci tempa.
        if (p.activeExpedition?.ambushedSince) {
          const elapsed = now - p.activeExpedition.ambushedSince;
          p.activeExpedition.endsAt += elapsed;
          p.activeExpedition.ambushedSince = undefined;
        }
        // Zaliczamy "final encounter" — każda wygrana ambush zalicza wymóg
        // walki na końcu ekspedycji (random LUB forced przy claim).
        if (p.activeExpedition) {
          p.activeExpedition.finalFightDone = true;
        }
        this.logAmbush(
          p.id,
          `🏆 Pokonano bandę: ${dropLabels.length ? dropLabels.join(', ') : 'brak lootu'} (+25 XP combat). Wyprawa wznowiona.`,
        );
      }
      lines.push('Wyprawa wznowiona — czas pozostały do końca przesunięty o trwanie walki.');
      this.stats.save();
      await postBattleSummary(state.thread, lines.join('\n').slice(0, 1900));
    }
    await closeBattleThread(
      state.thread,
      '🏁 Walka zakończona — wątek archiwizujemy. Wracajcie na wyprawę!',
    );
    this.states.delete(state.id);
  }

  private async timeoutAmbush(state: AmbushBattleState): Promise<void> {
    if (state.finished) return;
    state.finished = true;
    await this.battleStore.finish(state._battleId, { draw: true });
    for (const pc of state.combatants.filter((c) => c.team === 0)) {
      const p = this.stats.get(pc.id, pc.name);
      p.activeExpedition = null;
      this.logAmbush(p.id, `⏰ Timeout w ambushu — wyprawa przepadła.`);
    }
    this.stats.save();
    const hours = Math.round(AMBUSH_TIMEOUT_MS / 60_000 / 60);
    await postBattleSummary(
      state.thread,
      `⏰ **Ambush — timeout!** Brak akcji w czasie ${hours} h — wyprawa pada.`,
    );
    await closeBattleThread(state.thread, '🏁 Wątek zamknięty po timeoucie.');
    this.states.delete(state.id);
  }

  private async promptHumans(state: AmbushBattleState): Promise<void> {
    await promptHumansWithPanel(state);
  }

  private fmtBoard(state: AmbushBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (potki: ${c.consumables?.potion_small ?? 0})` : ''}`,
      )
      .join(' | ');
  }
}
