import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

/**
 * Boss z Region IV (T5). Lich-arcymag z Czarnej Cytadeli — endgame
 * wyzwanie dla pełnego party 4-osobowego.
 */
export class GreatLich extends Mob {
  readonly id = 'lich_wielki';
  readonly name = 'Lich Wielki';
  readonly tier: MobTier = 5;
  readonly hp = 320;
  readonly damageBonus = 28;
  override readonly defenseBonus = 6;
  override readonly critBonus = 0.15;
  override readonly speed = 5;
  override readonly primary: PrimaryStats = { str: 6, agi: 6, wit: 12, int: 24 };
  override readonly potions = 3;
  readonly description = 'Bezduszny mistrz nekromancji — najwyższy strażnik Czarnej Cytadeli.';
  override readonly skills = ['hellfire', 'meteor', 'phoenix_rebirth'];
  readonly attackLines = [
    'Promień Czarnej Mocy',
    'Wybuch Negatywnej Energii',
    'Klątwa Wieczystej Nocy',
    'Pchnięcie Kostnym Berłem',
    'Drenaż Życia',
  ];
  readonly rewards: MobReward = {
    xp: 1500,
    combatXp: 800,
    lootTable: [
      { itemId: 'gem_emerald', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_sapphire', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 25, qtyMin: 2, qtyMax: 3 },
      { itemId: 'wood_swiatowe', weight: 20 },
    ],
    rolls: 6,
    dropPool: ['sword_runicum', 'armor_runicum', 'sword_diamond', 'armor_diamond'],
    guaranteedDropChance: 0.95,
    bookDrops: [
      { skillId: 'dark_power', chance: 0.05 },
      { skillId: 'blood_vortex', chance: 0.05 },
    ],
  };
}
