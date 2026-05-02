import { City, type Merchant } from './city.js';

export class BlackCitadel extends City {
  readonly id = 'czarna_cytadela';
  readonly name = 'Czarna Cytadela';
  readonly description =
    'Mroczna forteca stanowiąca ostatni bastion cywilizacji w Przeklętej Północy.';
  readonly region = 4;
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
