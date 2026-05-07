import type { Collection } from 'mongodb';
import type { PlayerStats } from '../../modules/game/services/player-stats.js';

export type PlayerDoc = PlayerStats & { _id: string };

export class PlayerRepo {
  constructor(private readonly col: Collection<PlayerDoc>) {}

  async upsert(p: PlayerDoc): Promise<void> {
    await this.col.replaceOne({ _id: p._id }, p, { upsert: true });
  }

  async findAll(): Promise<PlayerDoc[]> {
    return this.col.find().toArray();
  }

  async count(): Promise<number> {
    return this.col.countDocuments();
  }

  async insertMany(docs: PlayerDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }
}
