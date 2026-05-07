import type { Collection } from 'mongodb';
import type { ItemInstance } from '../../modules/game/services/items.js';

export type ItemDoc = ItemInstance & { _id: string; userId: string };

export class ItemRepo {
  constructor(private readonly col: Collection<ItemDoc>) {}

  async upsert(doc: ItemDoc): Promise<void> {
    await this.col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findByUserId(userId: string): Promise<ItemDoc[]> {
    return this.col.find({ userId }).toArray();
  }

  async findAll(): Promise<ItemDoc[]> {
    return this.col.find().toArray();
  }

  async deleteOne(uid: string): Promise<void> {
    await this.col.deleteOne({ _id: uid });
  }

  async insertMany(docs: ItemDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.col.insertMany(docs);
  }

  async createIndexes(): Promise<void> {
    await this.col.createIndex({ userId: 1 });
  }
}
