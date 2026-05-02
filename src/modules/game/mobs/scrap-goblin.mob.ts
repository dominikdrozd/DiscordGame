import { Mob } from './mob.js';

export class ScrapGoblin extends Mob {
  readonly id = 'goblin_zlomiarz';
  readonly name = 'Goblin Złomiarz';
  readonly hp = 60;
  readonly damageBonus = 4;
  readonly description = 'Bryka po lesie ze zardzewiałą rurą i mówi do siebie.';
  readonly attackLines = ['Cios Zardzewiałą Rurą', 'Rzut Pustką po Tigerze', 'Kop w Goleń'];
}
