import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { makeRepos, ensureIndexes, type Repos } from '../../src/persistence/repos/index.js';

export interface TestEnv {
  db: Db;
  repos: Repos;
  cleanup: () => Promise<void>;
}

export interface TestHarness {
  mongod: MongoMemoryServer;
  client: MongoClient;
  newEnv: () => Promise<TestEnv>;
  close: () => Promise<void>;
}

/**
 * Spina mongodb-memory-server na czas describe-block. Każdy `newEnv()`
 * tworzy izolowaną bazę (unikalna nazwa via UUID), repos i ensureIndexes.
 */
export async function startTestHarness(): Promise<TestHarness> {
  const mongod = await MongoMemoryServer.create();
  const client = await MongoClient.connect(mongod.getUri());
  return {
    mongod,
    client,
    newEnv: async (): Promise<TestEnv> => {
      const dbName = `test-${randomUUID()}`;
      const db = client.db(dbName);
      const repos = makeRepos(db);
      await ensureIndexes(repos);
      return {
        db,
        repos,
        cleanup: async () => {
          await db.dropDatabase();
        },
      };
    },
    close: async () => {
      await client.close();
      await mongod.stop();
    },
  };
}
