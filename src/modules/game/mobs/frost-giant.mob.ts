import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

/**
 * Boss z Region III (T4). Olbrzym ze szczytów krasnoludzkiej Twierdzy —
 * twardy wall dla zaawansowanego party.
 */
export class FrostGiant extends Mob {
  readonly id = 'mrozowy_olbrzym';
  readonly name = 'Mrozowy Olbrzym';
  readonly tier: MobTier = 4;
  readonly hp = 220;
  readonly damageBonus = 22;
  override readonly defenseBonus = 7;
  override readonly critBonus = 0.05;
  override readonly speed = 1;
  override readonly primary: PrimaryStats = { str: 18, agi: 2, wit: 4, int: 8 };
  override readonly potions = 2;
  readonly description = 'Kolos lodu i kamienia — wielki, wolny, miażdżący.';
  override readonly skills = ['lodowy_grad', 'lodowy_sarkofag'];
  readonly attackLines = [
    'Wymach Lodowym Maczugą',
    'Miażdżący Tupnięcie',
    'Rzut Bryłą Lodu',
    'Mroźny Oddech',
  ];
  readonly rewards: MobReward = {
    xp: 700,
    combatXp: 380,
    lootTable: [
      { itemId: 'ore_mithril', weight: 35, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_sapphire', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 20 },
      { itemId: 'potion_greater', weight: 15, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 5,
    dropPool: ['sword_mithril', 'staff_mithril', 'bow_mithril', 'armor_mithril'],
    guaranteedDropChance: 0.8,
    bookDrops: [{ skillId: 'ice_sarcophagus', chance: 0.04 }],
  };
}
