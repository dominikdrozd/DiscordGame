import type { Collection } from 'mongodb';
import type { Party } from '../../modules/game/services/party.js';

export type PartyDoc = Party & { _id: string };

export class PartyRepo {
  constructor(private readonly col: Collection<PartyDoc>) {}

  async upsert(doc: PartyDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findAll(): Promise<PartyDoc[]> {
    return this.col.find().toArray();
  }

  async deleteOne(id: string): Promise<void> {
    await this.col.deleteOne({ _id: id });
  }

  async insertMany(docs: PartyDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }

  async createIndexes(): Promise<void> {
    await this.col.createIndex({ members: 1 });
  }
}
