import { Mob } from './mob.js';

export class TrolleZBloku extends Mob {
  readonly id = 'trolle_z_bloku';
  readonly name = 'Trolle z Bloku';
  readonly hp = 130;
  readonly damageBonus = 10;
  readonly description = 'Stoją pod klatką, plują nasionami i biją z buta.';
  readonly attackLines = [
    'Cios Adidasem',
    'Rzut Petem',
    'Walenie Czołem',
    'Pchnięcie z Klatki',
  ];
}
