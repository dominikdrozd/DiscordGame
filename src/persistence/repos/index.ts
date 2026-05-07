import type { Db } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from './player.repo.js';
import { ItemRepo, type ItemDoc } from './item.repo.js';
import { BattleRepo, type BattleDoc } from './battle.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
  battle: BattleRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
    battle: new BattleRepo(db.collection<BattleDoc>('battles')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  await repos.item.createIndexes();
  await repos.battle.createIndexes();
  // Phase 4: party indeksy.
}

export { PlayerRepo, ItemRepo, BattleRepo };
export type { PlayerDoc, ItemDoc, BattleDoc };
