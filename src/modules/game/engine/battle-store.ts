import type { BattleState, BattleAction } from './battle-state.js';
import type { BattleRepo, BattleDoc, BattleType } from '../../../persistence/repos/battle.repo.js';

/**
 * Type-specific context dla `create()`. Każda walka dostaje swój subset:
 * ambush/finalFight → expedition, dungeon → dungeonContext, etc.
 */
export interface BattleContext {
  parentChannelId: string;
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
}

/** Para load-time: state (do hydratacji w pamięci) + raw doc (do read-only meta). */
export interface LoadedBattle {
  state: BattleState;
  doc: BattleDoc;
}

export class BattleStore {
  constructor(private readonly repo: BattleRepo) {}

  /**
   * Pierwsze utrwalenie walki — zapisuje początkowy snapshot. Zwraca
   * `_battleId` (= state._battleId).
   */
  async create(state: BattleState, type: BattleType, ctx: BattleContext): Promise<string> {
    const now = Date.now();
    const doc: BattleDoc = {
      _id: state._battleId,
      type,
      threadId: state.id,
      parentChannelId: ctx.parentChannelId,
      combatants: state.combatants,
      pending: serializePending(state.pending),
      roundNumber: state.roundNumber,
      finished: state.finished,
      playerIds: state.combatants.filter((c) => c.team === 0).map((c) => c.id),
      createdAt: now,
      updatedAt: now,
    };
    if (state.winnerTeam !== undefined) doc.winnerTeam = state.winnerTeam;
    if (state.draw) doc.draw = true;
    if (ctx.expedition) doc.expedition = ctx.expedition;
    if (ctx.dungeonContext) doc.dungeonContext = ctx.dungeonContext;
    if (ctx.bossContext) doc.bossContext = ctx.bossContext;
    if (ctx.worldBossContext) doc.worldBossContext = ctx.worldBossContext;

    await this.repo.upsert(doc);
    return state._battleId;
  }

  /**
   * Aktualizuje stan walki w bazie. Wywoływane po każdej zakończonej rundzie.
   * Awaitowane — gwarantuje że snapshot jest na dysku PRZED wysłaniem
   * round-summary message (eliminuje "summary widoczny, crash przed snapshot").
   */
  async snapshot(state: BattleState): Promise<void> {
    const existing = await this.repo.findById(state._battleId);
    if (!existing) return; // race: walka mogła zostać finished w międzyczasie
    const updated: BattleDoc = {
      ...existing,
      threadId: state.id,
      combatants: state.combatants,
      pending: serializePending(state.pending),
      roundNumber: state.roundNumber,
      finished: state.finished,
      updatedAt: Date.now(),
    };
    if (state.winnerTeam !== undefined) updated.winnerTeam = state.winnerTeam;
    if (state.draw) updated.draw = true;
    await this.repo.upsert(updated);
  }

  /** Mark battle finished z wynikiem. Po `finish` snapshot nic nie robi (race-safe). */
  async finish(battleId: string, result: { winnerTeam?: number; draw?: boolean }): Promise<void> {
    await this.repo.markFinished(battleId, result);
  }

  /**
   * Wczytuje wszystkie aktywne walki z bazy. Zwraca tuple `{state, doc}` —
   * `state.thread = null` (do hydratacji przez serwis przy resume).
   */
  async loadActive(): Promise<LoadedBattle[]> {
    const docs = await this.repo.findActive();
    return docs.map((doc) => ({
      state: deserializeState(doc),
      doc,
    }));
  }

  async updateThreadId(battleId: string, threadId: string | null): Promise<void> {
    await this.repo.updateThreadId(battleId, threadId);
  }
}

function serializePending(pending: Map<string, BattleAction>): Record<string, BattleAction> {
  const out: Record<string, BattleAction> = {};
  for (const [k, v] of pending) out[k] = v;
  return out;
}

function deserializeState(doc: BattleDoc): BattleState {
  const pending = new Map<string, BattleAction>();
  for (const [k, v] of Object.entries(doc.pending)) pending.set(k, v);
  const state: BattleState = {
    _battleId: doc._id,
    id: doc.threadId ?? doc._id,
    thread: null,
    combatants: doc.combatants,
    pending,
    promptMessageIds: new Map(),
    roundNumber: doc.roundNumber,
    finished: doc.finished,
  };
  if (doc.winnerTeam !== undefined) state.winnerTeam = doc.winnerTeam;
  if (doc.draw) state.draw = true;
  return state;
}
