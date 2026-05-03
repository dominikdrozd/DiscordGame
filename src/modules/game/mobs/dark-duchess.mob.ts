import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

export class DarkDuchess extends Mob {
  readonly id = 'ksiazna_mroku';
  readonly name = 'Księżna Mroku z Mokotowa';
  readonly tier: MobTier = 4;
  readonly hp = 130;
  readonly damageBonus = 14;
  override readonly defenseBonus = 3;
  override readonly critBonus = 0.12;
  override readonly speed = 6;
  override readonly primary: PrimaryStats = { str: 8, agi: 4, wit: 8, int: 18 };
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
    bookDrops: [
      { skillId: 'curse_echo', chance: 0.02 },
      { skillId: 'shadow_veil', chance: 0.02 },
      { skillId: 'ice_sarcophagus', chance: 0.02 },
    ],
  };
}
