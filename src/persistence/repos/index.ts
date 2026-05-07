import type { Db } from 'mongodb';
import { PlayerRepo, type PlayerDoc } from './player.repo.js';
import { ItemRepo, type ItemDoc } from './item.repo.js';
import { BattleRepo, type BattleDoc } from './battle.repo.js';
import { PartyRepo, type PartyDoc } from './party.repo.js';

export interface Repos {
  player: PlayerRepo;
  item: ItemRepo;
  battle: BattleRepo;
  party: PartyRepo;
}

export function makeRepos(db: Db): Repos {
  return {
    player: new PlayerRepo(db.collection<PlayerDoc>('players')),
    item: new ItemRepo(db.collection<ItemDoc>('items')),
    battle: new BattleRepo(db.collection<BattleDoc>('battles')),
    party: new PartyRepo(db.collection<PartyDoc>('parties')),
  };
}

export async function ensureIndexes(repos: Repos): Promise<void> {
  await repos.item.createIndexes();
  await repos.battle.createIndexes();
  await repos.party.createIndexes();
}

export { PlayerRepo, ItemRepo, BattleRepo, PartyRepo };
export type { PlayerDoc, ItemDoc, BattleDoc, PartyDoc };
