import { MongoClient, type Db } from 'mongodb';

export class MongoConnection {
  private client: MongoClient | null = null;
  private database: Db | null = null;

  async connect(uri: string): Promise<void> {
    if (!uri) throw new Error('MONGO_URI is required');
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.database = this.client.db();
  }

  db(): Db {
    if (!this.database) throw new Error('MongoConnection not connected — call connect() first');
    return this.database;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.database = null;
    }
  }
}
