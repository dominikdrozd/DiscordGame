import { Mob, type MobReward } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

export class GoblinCook extends Mob {
  readonly id = 'goblin_kucharz';
  readonly name = 'Goblin Kucharz Adolf';
  readonly hp = 130;
  readonly damageBonus = 7;
  override readonly defenseBonus = 1;
  override readonly speed = 4;
  override readonly primary: PrimaryStats = { str: 6, agi: 2, wit: 2, int: 3 };
  override readonly potions = 1;
  readonly description = 'Wymachuje rondlem i pluje smażonym tłuszczem.';
  override readonly skills = ['cios_w_plecy'];
  readonly attackLines = [
    'Plask Rondlem',
    'Wrzątek z Garnka',
    'Cios Drewnianą Łyżką',
    'Rzut Solą w Oczy',
  ];
  readonly rewards: MobReward = {
    xp: 120,
    combatXp: 80,
    lootTable: [
      { itemId: 'ore_iron', weight: 60, qtyMin: 2, qtyMax: 4 },
      { itemId: 'wood_dab', weight: 40, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 3,
    dropPool: ['sword_iron', 'dagger_iron', 'bow_iron', 'staff_iron', 'armor_iron'],
    guaranteedDropChance: 0.5,
    bookDrops: [
      { skillId: 'curse_echo', chance: 0.02 },
      { skillId: 'fire_tornado', chance: 0.02 },
    ],
  };
}
