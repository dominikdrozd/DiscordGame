import { Mob, type MobReward, type MobTier } from './mob.js';

export class GoblinLeader extends Mob {
  readonly id = 'goblin_lider';
  readonly name = 'Goblin Lider Frytkowy';
  readonly tier: MobTier = 2;
  readonly hp = 75;
  readonly damageBonus = 5;
  override readonly defenseBonus = 1;
  override readonly potions = 1;
  readonly description = 'Dowódca bandy goblinów spod fast-foodu, dorabia w call-center.';
  override readonly skills = ['cios_w_plecy', 'taunt'];
  readonly attackLines = [
    'Cios Łopatką do Frytek',
    'Krzyk Komendanta',
    'Headbutt z Rogu',
    'Plask Mokrym Hamburgerem',
  ];
  readonly rewards: MobReward = {
    xp: 200,
    combatXp: 130,
    lootTable: [
      { itemId: 'ore_iron', weight: 50, qtyMin: 2, qtyMax: 4 },
      { itemId: 'ore_silver', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_dab', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 3,
    dropPool: ['sword_iron', 'armor_iron'],
    guaranteedDropChance: 0.6,
  };
}
