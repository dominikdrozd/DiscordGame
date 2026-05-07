import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoConnection } from '../../src/persistence/mongo.js';

describe('MongoConnection', () => {
  let mem: MongoMemoryServer;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await mem.stop();
  });

  it('connects given a valid URI and returns Db', async () => {
    const conn = new MongoConnection();
    await conn.connect(mem.getUri('test-conn'));
    const db = conn.db();
    expect(db.databaseName).toBe('test-conn');
    await conn.close();
  });

  it('throws on db() before connect()', () => {
    const conn = new MongoConnection();
    expect(() => conn.db()).toThrow(/not connected/i);
  });

  it('throws on connect() with empty URI', async () => {
    const conn = new MongoConnection();
    await expect(conn.connect('')).rejects.toThrow(/MONGO_URI/);
  });
});
