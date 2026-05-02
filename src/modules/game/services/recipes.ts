import { ITEMS } from './items.js';

export interface Recipe {
  id: string;
  outputBaseId?: string;
  outputResource?: { itemId: string; qty: number };
  ingredients: Record<string, number>;
  craftingLevelRequired: number;
  xpReward: number;
}

export const RECIPES: Record<string, Recipe> = {
  // tools
  pickaxe: {
    id: 'pickaxe',
    outputBaseId: 'pickaxe',
    ingredients: { ore_copper: 3, wood_sosna: 2 },
    craftingLevelRequired: 1,
    xpReward: 25,
  },
  rod: {
    id: 'rod',
    outputBaseId: 'rod',
    ingredients: { wood_sosna: 4 },
    craftingLevelRequired: 1,
    xpReward: 25,
  },
  axe: {
    id: 'axe',
    outputBaseId: 'axe',
    ingredients: { ore_copper: 2, wood_sosna: 3 },
    craftingLevelRequired: 1,
    xpReward: 25,
  },
  // weapons
  sword_iron: {
    id: 'sword_iron',
    outputBaseId: 'sword_iron',
    ingredients: { ore_iron: 4, wood_dab: 2 },
    craftingLevelRequired: 5,
    xpReward: 60,
  },
  sword_silver: {
    id: 'sword_silver',
    outputBaseId: 'sword_silver',
    ingredients: { ore_silver: 4, wood_buk: 2, gem_diamond: 1 },
    craftingLevelRequired: 12,
    xpReward: 150,
  },
  sword_mithril: {
    id: 'sword_mithril',
    outputBaseId: 'sword_mithril',
    ingredients: { ore_mithril: 3, wood_smoczy: 2 },
    craftingLevelRequired: 25,
    xpReward: 400,
  },
  // consumables
  potion_small: {
    id: 'potion_small',
    outputResource: { itemId: 'potion_small', qty: 1 },
    ingredients: { fish_karp: 1, wood_sosna: 1 },
    craftingLevelRequired: 1,
    xpReward: 10,
  },
  // armor
  armor_iron: {
    id: 'armor_iron',
    outputBaseId: 'armor_iron',
    ingredients: { ore_iron: 6 },
    craftingLevelRequired: 5,
    xpReward: 70,
  },
  armor_silver: {
    id: 'armor_silver',
    outputBaseId: 'armor_silver',
    ingredients: { ore_silver: 6, wood_buk: 1 },
    craftingLevelRequired: 12,
    xpReward: 160,
  },
  armor_mithril: {
    id: 'armor_mithril',
    outputBaseId: 'armor_mithril',
    ingredients: { ore_mithril: 5, gem_diamond: 1 },
    craftingLevelRequired: 25,
    xpReward: 450,
  },
};

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES[id];
}

export function listRecipes(): Recipe[] {
  return Object.values(RECIPES);
}

export function fmtRecipe(r: Recipe): string {
  let out: string;
  if (r.outputResource) {
    const tpl = ITEMS[r.outputResource.itemId];
    const name = tpl?.name ?? r.outputResource.itemId;
    out = `${name} ×${r.outputResource.qty}`;
  } else if (r.outputBaseId) {
    out = ITEMS[r.outputBaseId]?.name ?? r.outputBaseId;
  } else {
    out = r.id;
  }
  const ings = Object.entries(r.ingredients)
    .map(([id, qty]) => `${ITEMS[id]?.name ?? id} ×${qty}`)
    .join(', ');
  return `\`${r.id}\` → **${out}** (lvl craftingu ${r.craftingLevelRequired}): ${ings}`;
}
