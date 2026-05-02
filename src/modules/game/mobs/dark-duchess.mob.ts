import { Mob, type MobReward, type MobTier } from './mob.js';

export class DarkDuchess extends Mob {
  readonly id = 'ksiazna_mroku';
  readonly name = 'Księżna Mroku z Mokotowa';
  readonly tier: MobTier = 4;
  readonly hp = 90;
  readonly damageBonus = 5;
  override readonly defenseBonus = 2;
  override readonly critBonus = 0.12;
  override readonly potions = 2;
  readonly description = 'Aristokracja z apartamentu, kontrakt z piekłem, nie pyta o ceny.';
  override readonly skills = ['lodowy_grad', 'mrozny_strzal', 'osad_kacerza'];
  readonly attackLines = [
    'Smagnięcie Czarnym Welonem',
    'Mroźny Pocałunek',
    'Klątwa Złamanego Konta',
    'Cios Berłem z Hebanu',
  ];
  readonly rewards: MobReward = {
    xp: 500,
    combatXp: 300,
    lootTable: [
      { itemId: 'ore_mithril', weight: 40, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_smoczy', weight: 35, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 4,
    dropPool: ['sword_mithril', 'armor_mithril'],
    guaranteedDropChance: 0.85,
  };
}
