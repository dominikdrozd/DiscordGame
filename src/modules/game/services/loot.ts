import { ITEMS, type ItemTemplate } from './items.js';

export interface LootEntry {
  itemId: string;
  weight: number;
  minLevel?: number;
  qtyMin?: number;
  qtyMax?: number;
}

export interface RolledLoot {
  itemId: string;
  qty: number;
  template: ItemTemplate;
}

export function rollLoot(table: LootEntry[], skillLevel: number): RolledLoot | null {
  const eligible = table.filter((e) => (e.minLevel ?? 1) <= skillLevel && ITEMS[e.itemId]);
  if (!eligible.length) return null;
  const total = eligible.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of eligible) {
    r -= e.weight;
    if (r <= 0) {
      const qmin = e.qtyMin ?? 1;
      const qmax = e.qtyMax ?? qmin;
      const qty = qmin + Math.floor(Math.random() * (qmax - qmin + 1));
      return { itemId: e.itemId, qty, template: ITEMS[e.itemId] };
    }
  }
  return null;
}

export function rollLootMany(table: LootEntry[], skillLevel: number, rolls: number): RolledLoot[] {
  const out: RolledLoot[] = [];
  for (let i = 0; i < rolls; i++) {
    const r = rollLoot(table, skillLevel);
    if (r) out.push(r);
  }
  return out;
}

export const MINING_TABLE: LootEntry[] = [
  { itemId: 'ore_copper', weight: 50, minLevel: 1, qtyMin: 1, qtyMax: 2 },
  { itemId: 'ore_iron', weight: 35, minLevel: 5, qtyMin: 1, qtyMax: 2 },
  { itemId: 'ore_silver', weight: 15, minLevel: 12 },
  { itemId: 'ore_gold', weight: 6, minLevel: 20 },
  { itemId: 'ore_mithril', weight: 2, minLevel: 35 },
  { itemId: 'gem_diamond', weight: 1, minLevel: 1 },
];

export const FISHING_TABLE: LootEntry[] = [
  { itemId: 'fish_sardynka', weight: 50, minLevel: 1, qtyMin: 1, qtyMax: 3 },
  { itemId: 'fish_karp', weight: 35, minLevel: 1, qtyMin: 1, qtyMax: 2 },
  { itemId: 'fish_szczupak', weight: 18, minLevel: 8 },
  { itemId: 'fish_sum', weight: 6, minLevel: 18 },
  { itemId: 'fish_marlin', weight: 2, minLevel: 30 },
  { itemId: 'fish_kraken', weight: 1, minLevel: 50 },
];

export const WOODCUTTING_TABLE: LootEntry[] = [
  { itemId: 'wood_sosna', weight: 50, minLevel: 1, qtyMin: 1, qtyMax: 3 },
  { itemId: 'wood_dab', weight: 35, minLevel: 5, qtyMin: 1, qtyMax: 2 },
  { itemId: 'wood_buk', weight: 15, minLevel: 12 },
  { itemId: 'wood_heban', weight: 5, minLevel: 22 },
  { itemId: 'wood_smoczy', weight: 2, minLevel: 35 },
  { itemId: 'wood_swiatowe', weight: 1, minLevel: 50 },
];
