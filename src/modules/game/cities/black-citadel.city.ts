import { City, type Merchant } from './city.js';
import { Npc } from '../npcs/npc.js';
import { Wraul } from '../npcs/black-citadel/wraul.npc.js';
import { KrakenHunter } from '../npcs/black-citadel/kraken-hunter.npc.js';
import { TreeGuardian } from '../npcs/black-citadel/tree-guardian.npc.js';

export class BlackCitadel extends City {
  readonly id = 'czarna_cytadela';
  readonly name = 'Czarna Cytadela';
  readonly description =
    'Mroczna forteca stanowiąca ostatni bastion cywilizacji w Przeklętej Północy.';
  readonly region = 4;
  readonly npcs: Npc[] = [new Wraul(), new KrakenHunter(), new TreeGuardian()];
  readonly merchants: Merchant[] = [
    {
      id: 'arcymag_zelosz',
      name: 'Arcymag Żelosz',
      description: 'Kosztowne surowce magiczne — dla wytrwałych i bogatych.',
      sellMultiplier: 0.6,
      stock: [
        { itemId: 'wood_smoczy', buyPrice: 150 },
        { itemId: 'wood_swiatowe', buyPrice: 350 },
        { itemId: 'gem_diamond', buyPrice: 95 },
      ],
    },
    {
      id: 'mistrz_kuznia_warryl',
      name: 'Mistrz Kuźnia Warryl',
      description: 'Skup mithrilu, sprzedaż ruda i drewno do top-tier craftingu.',
      sellMultiplier: 0.6,
      stock: [
        { itemId: 'ore_mithril', buyPrice: 140 },
        { itemId: 'ore_gold', buyPrice: 70 },
      ],
    },
    {
      id: 'czarny_alchemik',
      name: 'Czarny Alchemik',
      description: 'Mikstury i znajomość rzeczy zakazanych.',
      sellMultiplier: 0.5,
      stock: [{ itemId: 'potion_small', buyPrice: 35 }],
    },
  ];
}
