import { Mob, type MobReward } from './mob.js';

export class GoblinKucharz extends Mob {
  readonly id = 'goblin_kucharz';
  readonly name = 'Goblin Kucharz Adolf';
  readonly hp = 90;
  readonly damageBonus = 6;
  override readonly defenseBonus = 1;
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
    dropPool: ['sword_iron', 'armor_iron'],
    guaranteedDropChance: 0.5,
  };
}
