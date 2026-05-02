import { Mob, type MobTier } from './mob.js';

export class UpiorZPkp extends Mob {
  readonly id = 'upior_z_pkp';
  readonly name = 'Upiór z PKP';
  readonly tier: MobTier = 4;
  readonly hp = 50;
  readonly damageBonus = 4;
  override readonly defenseBonus = 1;
  override readonly critBonus = 0.15;
  override readonly potions = 1;
  readonly description = 'Czeka na pociąg, którego nigdy nie będzie. Wkurzony jak pasażer.';
  override readonly skills = ['lodowy_grad'];
  readonly attackLines = [
    'Krzyk "OPÓŹNIONY!"',
    'Smagnięcie Biletem',
    'Cios Walizką Niewiadomego Pochodzenia',
    'Rozkład Jazdy w Twarz',
  ];
}
