import type { Client, ButtonInteraction } from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { PartyService, type Party } from '../services/party.js';
import { rollLootMany } from '../services/loot.js';
import { ITEMS } from '../services/items.js';
import { EXPEDITIONS, type ExpeditionDef } from './encounters.js';
import { randomAmbushMob, ambushTierForLevel, type RandomAmbushOpts } from '../mobs/index.js';
import { errMsg } from '../../../utils.js';

function buildAmbushOpts(def: ExpeditionDef | undefined, combatLvl: number): RandomAmbushOpts {
  const opts: RandomAmbushOpts = {};
  if (def?.ambushMobIds && def.ambushMobIds.length > 0) {
    opts.allowedIds = [...def.ambushMobIds];
  }
  if (def?.ambushTiers && def.ambushTiers.length > 0) {
    opts.allowedTiers = [...def.ambushTiers];
  } else {
    opts.tier = ambushTierForLevel(combatLvl);
  }
  return opts;
}
import {
  type BattleCombatant,
  type BattleState,
  aliveEnemies,
  findCombatant,
  humansAlive,
} from './battle-state.js';
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
    private readonly logAmbush: (playerId: string, line: string) => void = () => {},
  ) {}

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

    const tryUnarchive = async (): Promise<void> => {
      if (typeof state.thread.setArchived === 'function') {
        await state.thread.setArchived(false).catch(() => {});
      }
    };
    const sendBoard = async (): Promise<boolean> => {
      try {
        await state.thread.send(
          `⚔️ <@${playerId}> wraca do walki — aktualny stan:\n${this.fmtBoard(state)}`,
        );
        return true;
      } catch {
        return false;
      }
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
   * Zwraca nowy thread (z API) lub null jeśli odtworzenie nieudane
   * (np. brak permissions, channel zniknął razem z wątkiem).
   */
  private async recreateThreadFor(
    state: AmbushBattleState,
    playerId: string,
  ): Promise<unknown> {
    try {
      const channel = await this.client.channels.fetch(state.expedition.channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !('send' in channel)) return null;
      const players = state.combatants
        .filter((c) => c.team === 0)
        .map((c) => `<@${c.id}>`)
        .join(' ');
      const announcement = await channel
        .send(`⚔️ ${players} — wątek ambushu został odtworzony, kontynuujcie walkę!`)
        .catch(() => null);
      if (!announcement || typeof (announcement as { startThread?: unknown }).startThread !== 'function') {
        return null;
      }
      const thread = await (announcement as {
        startThread: (opts: { name: string; autoArchiveDuration: number }) => Promise<unknown>;
      })
        .startThread({
          name: `Ambush (resume): ${playerId}`.slice(0, 100),
          autoArchiveDuration: 60,
        })
        .catch(() => null);
      return thread ?? null;
    } catch (e) {
      console.error('[ambush] recreate thread fail:', errMsg(e));
      return null;
    }
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
    const mobCombatants: BattleCombatant[] = [];
    for (let i = 0; i < mobCount; i++) {
      const mob = randomAmbushMob(buildAmbushOpts(expDef, maxCombatLvl));
      const raw = mob.toCombatant(`${Date.now()}_${i + 1}`);
      mobCombatants.push({
        ...raw,
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

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) =>
        console.error('[ambush] party timeout fail:', errMsg(e)),
      );
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    const mobLine = mobCombatants.map((m) => `**${m.name}** (${m.hp} HP)`).join(', ');
    await thread.send(
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
    const mob = randomAmbushMob(buildAmbushOpts(expDef, player.skills.combat.level));
    const mobCombatant: BattleCombatant = {
      ...mob.toCombatant(`${Date.now()}`),
      team: 1,
      controller: 'ai',
    };

    const ambushStart = Date.now();
    // Zamrażamy czas wyprawy gracza — `endsAt` nie liczy się przez ambush.
    if (player.activeExpedition) player.activeExpedition.ambushedSince = ambushStart;
    this.stats.save();

    const state: AmbushBattleState = {
      id: thread.id,
      thread,
      combatants: [playerCombatant, mobCombatant],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      expedition: { destination: exp.destination, channelId: exp.channelId },
    };
    this.states.set(thread.id, state);

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) => console.error('[ambush] timeout fail:', errMsg(e)));
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    await thread.send(
      `**${mobCombatant.name}** (${mobCombatant.hp} HP, +${mobCombatant.damageBonus} dmg) blokuje Ci drogę! **Wyprawa zatrzymana** — dokończ walkę w ciągu **${Math.round(AMBUSH_TIMEOUT_MS / 60_000 / 60)} h** lub przepada.`,
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
        if (m)
          await m.edit({ components: [buildPanelOpenerRow(state.id, true)] }).catch(() => {});
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);

    // Log walki — zawsze, też dla ostatniej rundy gdy ktoś ginie.
    if (result.lines.length > 0) {
      await state.thread.send(
        [...result.lines, '', this.fmtBoard(state)].join('\n').slice(0, 1900),
      );
    }

    if (result.finished) {
      await this.finishAmbush(state, result);
      return;
    }

    await state.thread.send(`⏭ Runda ${state.roundNumber}`);
    await this.promptHumans(state);
  }

  private async finishAmbush(
    state: AmbushBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
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
