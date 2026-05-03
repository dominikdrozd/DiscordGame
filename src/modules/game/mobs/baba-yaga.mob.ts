import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

export class BabaYaga extends Mob {
  readonly id = 'baba_jaga';
  readonly name = 'Baba Jaga z Bloku';
  readonly tier: MobTier = 3;
  readonly hp = 130;
  readonly damageBonus = 12;
  override readonly defenseBonus = 3;
  override readonly critBonus = 0.1;
  override readonly speed = 3;
  override readonly primary: PrimaryStats = { str: 6, agi: 2, wit: 6, int: 16 };
  override readonly potions = 2;
  readonly description = 'Zna nalewki, klątwy i numer do skarbówki.';
  override readonly skills = ['trucizna', 'lodowy_grad'];
  readonly attackLines = [
    'Klątwa Skarbówki',
    'Cios Miotłą',
    'Rzut Słoikiem Smalcu',
    'Splunięcie Nalewką',
  ];
  readonly rewards: MobReward = {
    xp: 300,
    combatXp: 180,
    lootTable: [
      { itemId: 'ore_silver', weight: 50, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 10 },
      { itemId: 'wood_buk', weight: 40, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 3,
    dropPool: ['sword_silver', 'dagger_silver', 'staff_silver', 'armor_silver'],
    guaranteedDropChance: 0.7,
    bookDrops: [
      { skillId: 'blood_vortex', chance: 0.02 },
      { skillId: 'second_wind', chance: 0.02 },
      { skillId: 'saviors_grace', chance: 0.02 },
    ],
  };
}
