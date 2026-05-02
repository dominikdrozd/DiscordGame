import { Mob } from './mob.js';

export class PetlicaBandits extends Mob {
  readonly id = 'bandyci_z_petlicy';
  readonly name = 'Bandyci z Pętlicy';
  readonly hp = 100;
  readonly damageBonus = 8;
  override readonly potions = 1;
  readonly description = 'Chcą tylko twojego portfela i godności.';
  readonly attackLines = [
    'Dźgnięcie Sprężynowcem',
    'Strzał z Procy',
    'Bekanie z Wódki',
    'Cios w Splot',
  ];
}
