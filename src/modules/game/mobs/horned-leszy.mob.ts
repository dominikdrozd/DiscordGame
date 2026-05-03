import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

/**
 * Boss z Region II (T3). Pradawny duch puszczy oakhaweńskiej —
 * przeciwnik dla średnio-zaawansowanych party.
 */
export class HornedLeszy extends Mob {
  readonly id = 'leszy_rogaty';
  readonly name = 'Leszy Rogaty';
  readonly tier: MobTier = 3;
  readonly hp = 150;
  readonly damageBonus = 14;
  override readonly defenseBonus = 4;
  override readonly critBonus = 0.08;
  override readonly speed = 3;
  override readonly primary: PrimaryStats = { str: 8, agi: 5, wit: 5, int: 10 };
  override readonly potions = 2;
  readonly description = 'Pradawny duch puszczy z porożem oplecionym mchem.';
  override readonly skills = ['trucizna', 'tornado'];
  readonly attackLines = [
    'Cios Pradawnym Porożem',
    'Splunięcie Sokiem Brzozy',
    'Tupnięcie Kopytem',
    'Wycie Lasu',
  ];
  readonly rewards: MobReward = {
    xp: 380,
    combatXp: 220,
    lootTable: [
      { itemId: 'wood_heban', weight: 35, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_ruby', weight: 25 },
      { itemId: 'gem_emerald', weight: 20 },
      { itemId: 'potion_greater', weight: 20 },
    ],
    rolls: 4,
    dropPool: ['sword_silver', 'armor_silver'],
    guaranteedDropChance: 0.7,
    bookDrops: [{ skillId: 'shadow_veil', chance: 0.03 }],
  };
}
