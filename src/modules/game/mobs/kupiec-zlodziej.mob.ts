import { Mob } from './mob.js';

export class KupiecZlodziej extends Mob {
  readonly id = 'kupiec_zlodziej';
  readonly name = 'Wędrowny Kupiec-Złodziej';
  readonly hp = 50;
  readonly damageBonus = 3;
  readonly description = 'Sprzedaje, kradnie, znika — czasem wszystko naraz.';
  readonly attackLines = [
    'Cios Wagą Targową',
    'Rzut Sakiewką',
    'Podstawienie Nogi',
    'Krzyk "Ej cwaniaczku!"',
  ];
}
