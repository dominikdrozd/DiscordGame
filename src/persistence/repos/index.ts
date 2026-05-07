import type { Db } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from './player.repo.js';
import { ItemRepo, type ItemDoc } from './item.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  await repos.item.createIndexes();
  // Phase 2-4: dojdą indeksy dla parties.members, battles.{playerIds, finished, updatedAt(TTL)}.
}

export { PlayerRepo, ItemRepo };
export type { PlayerDoc, ItemDoc };
