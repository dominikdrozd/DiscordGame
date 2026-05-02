export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'resource' | 'consumable' | 'weapon' | 'armor' | 'tool';
export type ItemSlot = 'weapon' | 'armor' | 'tool';
export type ToolKind = 'pickaxe' | 'rod' | 'axe';

export interface ItemStats {
  attack?: number;
  defense?: number;
  hp?: number;
  crit?: number; // %
}

export interface ItemTemplate {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  slot?: ItemSlot;
  toolKind?: ToolKind;
  toolTier?: number; // 1..n
  baseStats?: ItemStats;
  description?: string;
}

export interface ItemInstance {
  uid: string;
  baseId: string;
  rarity: Rarity;
  name: string;
  stats: ItemStats;
  slot?: ItemSlot;
  toolKind?: ToolKind;
  toolTier?: number;
}

export const RARITY_EMOJI: Record<Rarity, string> = {
  common: '⚪',
  uncommon: '🟢',
  rare: '🔵',
  epic: '🟣',
  legendary: '🟡',
};

const RARITY_PREFIX: Record<Rarity, string> = {
  common: '',
  uncommon: 'Solidny',
  rare: 'Rzadki',
  epic: 'Epicki',
  legendary: 'Legendarny',
};

const RARITY_ROLL: Array<{ rarity: Rarity; chance: number }> = [
  { rarity: 'common', chance: 0.55 },
  { rarity: 'uncommon', chance: 0.25 },
  { rarity: 'rare', chance: 0.13 },
  { rarity: 'epic', chance: 0.05 },
  { rarity: 'legendary', chance: 0.02 },
];

const RARITY_STAT_RANGES: Record<
  Rarity,
  { count: number; ranges: Record<keyof ItemStats, [number, number]> }
> = {
  common: {
    count: 1,
    ranges: { attack: [1, 3], defense: [1, 2], hp: [1, 3], crit: [0, 1] },
  },
  uncommon: {
    count: 2,
    ranges: { attack: [3, 6], defense: [2, 4], hp: [3, 6], crit: [1, 2] },
  },
  rare: {
    count: 3,
    ranges: { attack: [6, 10], defense: [4, 7], hp: [6, 10], crit: [2, 4] },
  },
  epic: {
    count: 3,
    ranges: { attack: [10, 15], defense: [7, 11], hp: [10, 15], crit: [4, 7] },
  },
  legendary: {
    count: 4,
    ranges: { attack: [15, 25], defense: [11, 18], hp: [15, 25], crit: [7, 12] },
  },
};

const STATS_BY_TYPE: Record<ItemType, Array<keyof ItemStats>> = {
  weapon: ['attack', 'crit', 'hp'],
  armor: ['defense', 'hp', 'attack'],
  tool: ['attack'],
  resource: [],
  consumable: [],
};

export const ITEMS: Record<string, ItemTemplate> = {
  // ── RESOURCES (mining) ────────────────────────────
  ore_copper: { id: 'ore_copper', name: 'Ruda Miedzi', type: 'resource', rarity: 'common' },
  ore_iron: { id: 'ore_iron', name: 'Ruda Żelaza', type: 'resource', rarity: 'common' },
  ore_silver: { id: 'ore_silver', name: 'Ruda Srebra', type: 'resource', rarity: 'uncommon' },
  ore_gold: { id: 'ore_gold', name: 'Ruda Złota', type: 'resource', rarity: 'rare' },
  ore_mithril: { id: 'ore_mithril', name: 'Ruda Mithrilu', type: 'resource', rarity: 'epic' },
  gem_diamond: { id: 'gem_diamond', name: 'Diament', type: 'resource', rarity: 'legendary' },

  // ── RESOURCES (fishing) ────────────────────────────
  fish_sardynka: { id: 'fish_sardynka', name: 'Sardynka', type: 'resource', rarity: 'common' },
  fish_karp: { id: 'fish_karp', name: 'Karp', type: 'resource', rarity: 'common' },
  fish_szczupak: { id: 'fish_szczupak', name: 'Szczupak', type: 'resource', rarity: 'uncommon' },
  fish_sum: { id: 'fish_sum', name: 'Sum Olbrzym', type: 'resource', rarity: 'rare' },
  fish_marlin: { id: 'fish_marlin', name: 'Marlin', type: 'resource', rarity: 'epic' },
  fish_kraken: { id: 'fish_kraken', name: 'Mały Kraken', type: 'resource', rarity: 'legendary' },

  // ── RESOURCES (woodcutting) ───────────────────────
  wood_sosna: { id: 'wood_sosna', name: 'Sosna', type: 'resource', rarity: 'common' },
  wood_dab: { id: 'wood_dab', name: 'Dąb', type: 'resource', rarity: 'common' },
  wood_buk: { id: 'wood_buk', name: 'Buk', type: 'resource', rarity: 'uncommon' },
  wood_heban: { id: 'wood_heban', name: 'Heban', type: 'resource', rarity: 'rare' },
  wood_smoczy: {
    id: 'wood_smoczy',
    name: 'Drewno Smoczego Dębu',
    type: 'resource',
    rarity: 'epic',
  },
  wood_swiatowe: {
    id: 'wood_swiatowe',
    name: 'Drewno z Drzewa Świata',
    type: 'resource',
    rarity: 'legendary',
  },

  // ── CONSUMABLES ────────────────────────────────────
  potion_small: { id: 'potion_small', name: 'Mała Mikstura', type: 'consumable', rarity: 'common' },

  // ── TOOL TEMPLATES (craftable) ─────────────────────
  pickaxe: {
    id: 'pickaxe',
    name: 'Kilof',
    type: 'tool',
    rarity: 'common',
    slot: 'tool',
    toolKind: 'pickaxe',
    toolTier: 1,
  },
  rod: {
    id: 'rod',
    name: 'Wędka',
    type: 'tool',
    rarity: 'common',
    slot: 'tool',
    toolKind: 'rod',
    toolTier: 1,
  },
  axe: {
    id: 'axe',
    name: 'Siekiera',
    type: 'tool',
    rarity: 'common',
    slot: 'tool',
    toolKind: 'axe',
    toolTier: 1,
  },

  // ── WEAPON TEMPLATES (craftable) ───────────────────
  sword_iron: {
    id: 'sword_iron',
    name: 'Żelazny Miecz',
    type: 'weapon',
    rarity: 'common',
    slot: 'weapon',
  },
  sword_silver: {
    id: 'sword_silver',
    name: 'Srebrny Miecz',
    type: 'weapon',
    rarity: 'uncommon',
    slot: 'weapon',
  },
  sword_mithril: {
    id: 'sword_mithril',
    name: 'Mithrilowy Miecz',
    type: 'weapon',
    rarity: 'rare',
    slot: 'weapon',
  },

  // ── ARMOR TEMPLATES (craftable) ────────────────────
  armor_iron: {
    id: 'armor_iron',
    name: 'Żelazna Zbroja',
    type: 'armor',
    rarity: 'common',
    slot: 'armor',
  },
  armor_silver: {
    id: 'armor_silver',
    name: 'Srebrna Zbroja',
    type: 'armor',
    rarity: 'uncommon',
    slot: 'armor',
  },
  armor_mithril: {
    id: 'armor_mithril',
    name: 'Mithrilowa Zbroja',
    type: 'armor',
    rarity: 'rare',
    slot: 'armor',
  },
};

export function getTemplate(id: string): ItemTemplate | undefined {
  return ITEMS[id];
}

export function rollRarity(luck = 0): Rarity {
  const r = Math.random() - luck;
  let acc = 0;
  for (const { rarity, chance } of RARITY_ROLL) {
    acc += chance;
    if (r < acc) return rarity;
  }
  return 'common';
}

function randIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollStats(template: ItemTemplate, rarity: Rarity): ItemStats {
  const cfg = RARITY_STAT_RANGES[rarity];
  const candidates = STATS_BY_TYPE[template.type];
  if (!candidates.length) return {};
  const pickCount = Math.min(cfg.count, candidates.length);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, pickCount);
  const out: ItemStats = {};
  for (const stat of shuffled) {
    const range = cfg.ranges[stat];
    if (!range) continue;
    out[stat] = randIntInclusive(range[0], range[1]);
  }
  if (template.baseStats) {
    for (const k of Object.keys(template.baseStats) as Array<keyof ItemStats>) {
      out[k] = (out[k] ?? 0) + (template.baseStats[k] ?? 0);
    }
  }
  return out;
}

let uidCounter = 0;
function newUid(): string {
  uidCounter += 1;
  return `${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function rollItemInstance(baseId: string, forcedRarity?: Rarity): ItemInstance | null {
  const tpl = ITEMS[baseId];
  if (!tpl) return null;
  if (tpl.type === 'resource' || tpl.type === 'consumable') return null;
  const rarity = forcedRarity ?? rollRarity();
  const stats = rollStats(tpl, rarity);
  const prefix = RARITY_PREFIX[rarity];
  const name = prefix ? `${prefix} ${tpl.name}` : tpl.name;
  return {
    uid: newUid(),
    baseId,
    rarity,
    name,
    stats,
    slot: tpl.slot,
    toolKind: tpl.toolKind,
    toolTier: tpl.toolTier,
  };
}

export function fmtStats(s: ItemStats): string {
  const parts: string[] = [];
  if (s.attack) parts.push(`+${s.attack} atk`);
  if (s.defense) parts.push(`+${s.defense} def`);
  if (s.hp) parts.push(`+${s.hp} hp`);
  if (s.crit) parts.push(`+${s.crit}% crit`);
  return parts.join(', ') || '—';
}

export function fmtInstance(it: ItemInstance): string {
  return `${RARITY_EMOJI[it.rarity]} **${it.name}** (${fmtStats(it.stats)})`;
}

export function fmtResource(id: string, qty: number): string {
  const tpl = ITEMS[id];
  const name = tpl?.name ?? id;
  const emoji = tpl ? RARITY_EMOJI[tpl.rarity] : '';
  return `${emoji} ${name} ×${qty}`;
}

export const COMBAT_CONSUMABLES = new Set<string>(['potion_small']);

export function isCombatConsumable(id: string): boolean {
  return COMBAT_CONSUMABLES.has(id);
}
