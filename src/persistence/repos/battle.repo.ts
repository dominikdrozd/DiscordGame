import type { Collection } from 'mongodb';
import type { BattleCombatant, BattleAction } from '../../modules/game/engine/battle-state.js';

export type BattleType = 'ambush' | 'dungeon' | 'boss' | 'finalFight' | 'worldBoss';

export interface BattleDoc {
  /** Stabilny UUID — niezmienny przez thread recreate. */
  _id: string;
  type: BattleType;
  /** Aktualny Discord thread; null gdy thread zniknął i czeka na recreate. */
  threadId: string | null;
  /** Parent channel — używane do recreate thread. */
  parentChannelId: string;
  combatants: BattleCombatant[];
  /** Map<combatantId, BattleAction> serializowane jako Record. */
  pending: Record<string, BattleAction>;
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
  /** team===0 ids — index column dla szybkiego "active battles for player" lookup. */
  playerIds: string[];
  // type-specific (opcjonalne, jedno z poniższych w zależności od `type`):
  expedition?: { destination: string; channelId: string };
  dungeonContext?: { dungeonId: string; floor: number };
  bossContext?: { bossId: string };
  worldBossContext?: { bossId: string; phase: number };
  // metadata
  createdAt: number;
  updatedAt: number;
}

export class BattleRepo {
  constructor(private readonly col: Collection<BattleDoc>) {}

  async upsert(doc: BattleDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findById(id: string): Promise<BattleDoc | null> {
    return this.col.findOne({ _id: id });
  }

  async findActive(): Promise<BattleDoc[]> {
    return this.col.find({ finished: false }).toArray();
  }

  async updateThreadId(id: string, threadId: string | null): Promise<void> {
    await this.col.updateOne({ _id: id }, { $set: { threadId, updatedAt: Date.now() } });
  }

  async markFinished(
    id: string,
    result: { winnerTeam?: number; draw?: boolean },
  ): Promise<void> {
    const set: Partial<BattleDoc> = { finished: true, updatedAt: Date.now() };
    if (result.winnerTeam !== undefined) set.winnerTeam = result.winnerTeam;
    if (result.draw) set.draw = true;
    await this.col.updateOne({ _id: id }, { $set: set });
  }

  async createIndexes(): Promise<void> {
    // Active battles per player — kluczowe dla recovery
    await this.col.createIndex({ playerIds: 1, finished: 1 });
    // TTL: finished battles znikają po 7 dniach (auto-purge historii)
    await this.col.createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { finished: true } },
    );
  }
}
