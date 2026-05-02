import { Mob, type MobReward } from './mob.js';

export class SmokPolonezowy extends Mob {
  readonly id = 'smok_polonezowy';
  readonly name = 'Smok Polonezowy';
  readonly hp = 280;
  readonly damageBonus = 13;
  override readonly defenseBonus = 5;
  override readonly critBonus = 0.15;
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
    dropPool: ['sword_mithril', 'armor_mithril'],
    guaranteedDropChance: 1,
  };
}
