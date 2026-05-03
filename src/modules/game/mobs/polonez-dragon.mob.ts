import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

export class PolonezDragon extends Mob {
  readonly id = 'smok_polonezowy';
  readonly name = 'Smok Polonezowy';
  readonly tier: MobTier = 4;
  readonly hp = 180;
  readonly damageBonus = 17;
  override readonly defenseBonus = 5;
  override readonly critBonus = 0.15;
  override readonly speed = 4;
  override readonly primary: PrimaryStats = { str: 14, agi: 4, wit: 8, int: 20 };
  override readonly potions = 3;
  readonly description = 'Wieje benzyną, śmierdzi olejem napędowym, ale zionie ogniem.';
  override readonly skills = ['kula_ognia', 'mrozny_strzal', 'lodowy_grad'];
  readonly attackLines = [
    'Zionięcie Benzyną',
    'Uderzenie Ogonem',
    'Sztos Skrzydłem',
    'Wybuch Wydechu',
    'Pazur Polonezowy',
  ];
  readonly rewards: MobReward = {
    xp: 700,
    combatXp: 400,
    lootTable: [
      { itemId: 'ore_mithril', weight: 50, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 30 },
      { itemId: 'wood_smoczy', weight: 20 },
    ],
    rolls: 4,
    dropPool: ['sword_mithril', 'bow_mithril', 'staff_mithril', 'armor_mithril'],
    guaranteedDropChance: 1,
    bookDrops: [
      { skillId: 'time_shield', chance: 0.02 },
      { skillId: 'fire_tornado', chance: 0.02 },
      { skillId: 'ice_sarcophagus', chance: 0.02 },
    ],
  };
}
