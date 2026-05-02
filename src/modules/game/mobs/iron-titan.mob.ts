import { Mob, type MobReward, type MobTier } from './mob.js';

export class IronTitan extends Mob {
  readonly id = 'tytan_zelaza';
  readonly name = 'Tytan Żelaza z Huty';
  readonly tier: MobTier = 5;
  readonly hp = 90;
  readonly damageBonus = 4;
  override readonly defenseBonus = 3;
  override readonly critBonus = 0.2;
  override readonly potions = 4;
  readonly description = 'Stalowa zbroja zlana z mięsem, pamięta jeszcze stocznię.';
  override readonly skills = ['kula_ognia', 'meteor', 'pieklo'];
  readonly attackLines = [
    'Pięść Suwnicy',
    'Stalowy Bumelang',
    'Zionięcie Hutniczego Pyłu',
    'Krzyk Mistrza Zmiany',
    'Cios Spawalniczym Łukiem',
  ];
  readonly rewards: MobReward = {
    xp: 1200,
    combatXp: 700,
    lootTable: [
      { itemId: 'ore_mithril', weight: 50, qtyMin: 2, qtyMax: 3 },
      { itemId: 'gem_diamond', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_swiatowe', weight: 20 },
    ],
    rolls: 5,
    dropPool: ['sword_mithril', 'armor_mithril'],
    guaranteedDropChance: 1,
  };
}
