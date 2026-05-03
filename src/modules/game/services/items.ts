export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'resource' | 'consumable' | 'weapon' | 'armor' | 'tool';
export type ItemSlot = 'weapon' | 'armor' | 'tool';
export type ToolKind = 'pickaxe' | 'rod' | 'axe';
export type PrimaryKey = 'str' | 'agi' | 'wit' | 'int';

export interface ItemStats {
  attack?: number;
  defense?: number;
  hp?: number;
  crit?: number; // %
  /** Inicjatywa w walce — wyższy speed atakuje pierwszy. Items mogą dodać. */
  speed?: number;
}

/** Primary stat bonusy z itemu — rolowane per rarity, dodawane do gracza w effective stats. */
export type ItemPrimary = Partial<Record<PrimaryKey, number>>;

const STAT_KEYS = [
  'attack',
  'defense',
  'hp',
  'crit',
  'speed',
] as const satisfies readonly (keyof ItemStats)[];

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

/**
 * Pojedynczy upgrade itemu u kowala. Każdy `+1` dodaje jeden record
 * do `ItemInstance.upgrades` z konkretnymi bonusami które dorzucił.
 *
 * Reversibility: failure ulepszenia (-1) usuwa **ostatni** record z listy,
 * więc base.stats + sum(upgrades[..-1]) zwraca pierwotny snapshot bez
 * konieczności pamiętania historii rolli.
 */
export interface UpgradeRecord {
  attack?: number;
  defense?: number;
  hp?: number;
  crit?: number;
  speed?: number;
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
  /** Lista upgradów (reversible, każdy +1 = 1 record). Brak = item bez ulepszeń. */
  upgrades?: UpgradeRecord[];
  /** Primary stat bonusy (str/agi/wit/int) — rolowane per rarity. */
  primary?: ItemPrimary;
  /**
   * Diablo-style identification flag. Drop-y > common przychodzą `false` —
   * gracz widzi tylko name/rarity/required level, nie statystyki. Identyfikacja
   * w mieście (kosztem złota) ustawia `true` i odblokowuje stats + equip.
   * Crafted items i T1 (common) zawsze `true`.
   */
  identified?: boolean;
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
    ranges: { attack: [1, 3], defense: [1, 2], hp: [1, 3], crit: [0, 1], speed: [0, 1] },
  },
  uncommon: {
    count: 2,
    ranges: { attack: [3, 6], defense: [2, 4], hp: [3, 6], crit: [1, 2], speed: [1, 2] },
  },
  rare: {
    count: 3,
    ranges: { attack: [6, 10], defense: [4, 7], hp: [6, 10], crit: [2, 4], speed: [2, 4] },
  },
  epic: {
    count: 3,
    ranges: { attack: [10, 15], defense: [7, 11], hp: [10, 15], crit: [4, 7], speed: [3, 6] },
  },
  legendary: {
    count: 4,
    ranges: { attack: [15, 25], defense: [11, 18], hp: [15, 25], crit: [7, 12], speed: [5, 10] },
  },
};

const STATS_BY_TYPE: Record<ItemType, Array<keyof ItemStats>> = {
  weapon: ['attack', 'crit', 'hp', 'speed'],
  armor: ['defense', 'hp', 'attack'],
  tool: ['attack', 'speed'],
  resource: [],
  consumable: [],
};

/**
 * Primary stat rolls per rarity — niezależny roll od `RARITY_STAT_RANGES`.
 * Common items nie dostają primary (zachowanie sprzed feature). Rarity nie
 * tylko zwiększa range ale i `count` slotów — legendary ma 3 różne primary.
 */
const PRIMARY_RARITY_RANGES: Record<Rarity, { count: number; range: [number, number] }> = {
  common: { count: 0, range: [0, 0] },
  uncommon: { count: 1, range: [1, 1] },
  rare: { count: 2, range: [1, 2] },
  epic: { count: 2, range: [2, 4] },
  legendary: { count: 3, range: [3, 6] },
};

const PRIMARY_KEYS: readonly PrimaryKey[] = ['str', 'agi', 'wit', 'int'];

/**
 * Cena identyfikacji per rarity. Rośnie wykładniczo, żeby legendary
 * to była realna decyzja "kupuję czy sprzedaję" zamiast no-brainer.
 */
export const IDENTIFY_COSTS: Record<Rarity, number> = {
  common: 0,
  uncommon: 50,
  rare: 200,
  epic: 800,
  legendary: 3000,
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

  // ── DUNGEON GEMS (resources, drop tylko z dungeonów) ──
  gem_ruby: {
    id: 'gem_ruby',
    name: 'Rubin',
    type: 'resource',
    rarity: 'rare',
    description: 'Krwistoczerwony klejnot — drop z dungeonów regionu II/III.',
  },
  gem_sapphire: {
    id: 'gem_sapphire',
    name: 'Szafir',
    type: 'resource',
    rarity: 'epic',
    description: 'Lazurowy klejnot — drop z dungeonów regionu III/IV.',
  },
  gem_emerald: {
    id: 'gem_emerald',
    name: 'Szmaragd',
    type: 'resource',
    rarity: 'epic',
    description: 'Zielony klejnot najgłębszych pieczar — drop z dungeonów.',
  },

  // ── CONSUMABLES ────────────────────────────────────
  potion_small: { id: 'potion_small', name: 'Mała Mikstura', type: 'consumable', rarity: 'common' },
  potion_greater: {
    id: 'potion_greater',
    name: 'Wielka Mikstura',
    type: 'consumable',
    rarity: 'rare',
    description: 'Leczy 60 HP w jednej akcji — droga, ale ratuje życie.',
  },

  // ── QUEST ITEMS ────────────────────────────────────
  cykada_token: {
    id: 'cykada_token',
    name: 'Cykada Token',
    type: 'resource',
    rarity: 'rare',
    description: 'Pamiątkowy żeton z Portu Cykada — przedmiot questowy.',
  },
  marek_ore: {
    id: 'marek_ore',
    name: 'Próbka Rudy Marka',
    type: 'resource',
    rarity: 'uncommon',
    description: 'Specjalna ruda dla Marka — wykopiesz ją tylko gdy jego quest jest aktywny.',
  },
  marek_log: {
    id: 'marek_log',
    name: 'Próbka Drewna Marka',
    type: 'resource',
    rarity: 'uncommon',
    description: 'Specjalne drewno dla Marka — wytniesz tylko gdy jego quest jest aktywny.',
  },
  marek_fish_token: {
    id: 'marek_fish_token',
    name: 'Łuska Cykady',
    type: 'resource',
    rarity: 'uncommon',
    description: 'Rzadka łuska — Marek dał ci wędkę i prosił o przyniesienie tego okazu.',
  },

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

  // ── WEAPON TEMPLATES — 4 typy × 5 tierów ───────────
  // Identity przez `baseStats` (zawsze aplikowane, niezależnie od rolli).
  // Sword: balanced (+atk). Dagger: crit/speed. Bow: speed/crit. Staff: heavy atk.

  // Sword — balanced damage dealer.
  sword_iron: {
    id: 'sword_iron',
    name: 'Żelazny Miecz',
    type: 'weapon',
    rarity: 'common',
    slot: 'weapon',
    baseStats: { attack: 2 },
  },
  sword_silver: {
    id: 'sword_silver',
    name: 'Srebrny Miecz',
    type: 'weapon',
    rarity: 'uncommon',
    slot: 'weapon',
    baseStats: { attack: 3 },
  },
  sword_mithril: {
    id: 'sword_mithril',
    name: 'Mithrilowy Miecz',
    type: 'weapon',
    rarity: 'rare',
    slot: 'weapon',
    baseStats: { attack: 4 },
  },
  sword_diamond: {
    id: 'sword_diamond',
    name: 'Diamentowy Miecz',
    type: 'weapon',
    rarity: 'epic',
    slot: 'weapon',
    baseStats: { attack: 5 },
  },
  sword_runicum: {
    id: 'sword_runicum',
    name: 'Miecz Runiczny',
    type: 'weapon',
    rarity: 'legendary',
    slot: 'weapon',
    baseStats: { attack: 7 },
    description: 'Wykuty z runicum — broń godna mistrza, drop tylko z najgłębszych dungeonów.',
  },

  // Dagger — fast strikes, crit-focused but still hits hard.
  dagger_iron: {
    id: 'dagger_iron',
    name: 'Żelazny Sztylet',
    type: 'weapon',
    rarity: 'common',
    slot: 'weapon',
    baseStats: { attack: 1, crit: 1, speed: 1 },
  },
  dagger_silver: {
    id: 'dagger_silver',
    name: 'Srebrny Sztylet',
    type: 'weapon',
    rarity: 'uncommon',
    slot: 'weapon',
    baseStats: { attack: 2, crit: 2, speed: 1 },
  },
  dagger_mithril: {
    id: 'dagger_mithril',
    name: 'Mithrilowy Sztylet',
    type: 'weapon',
    rarity: 'rare',
    slot: 'weapon',
    baseStats: { attack: 3, crit: 3, speed: 2 },
  },
  dagger_diamond: {
    id: 'dagger_diamond',
    name: 'Diamentowy Sztylet',
    type: 'weapon',
    rarity: 'epic',
    slot: 'weapon',
    baseStats: { attack: 4, crit: 4, speed: 2 },
  },
  dagger_runicum: {
    id: 'dagger_runicum',
    name: 'Sztylet Runiczny',
    type: 'weapon',
    rarity: 'legendary',
    slot: 'weapon',
    baseStats: { attack: 5, crit: 6, speed: 3 },
    description: 'Klinga tnie szybciej niż oko zauważy — najsmukliejsza broń mistrza.',
  },

  // Bow — distance damage, speed/crit specialist with solid attack.
  bow_iron: {
    id: 'bow_iron',
    name: 'Żelazny Łuk',
    type: 'weapon',
    rarity: 'common',
    slot: 'weapon',
    baseStats: { attack: 1, speed: 2, crit: 1 },
  },
  bow_silver: {
    id: 'bow_silver',
    name: 'Srebrny Łuk',
    type: 'weapon',
    rarity: 'uncommon',
    slot: 'weapon',
    baseStats: { attack: 2, speed: 3, crit: 1 },
  },
  bow_mithril: {
    id: 'bow_mithril',
    name: 'Mithrilowy Łuk',
    type: 'weapon',
    rarity: 'rare',
    slot: 'weapon',
    baseStats: { attack: 3, speed: 4, crit: 2 },
  },
  bow_diamond: {
    id: 'bow_diamond',
    name: 'Diamentowy Łuk',
    type: 'weapon',
    rarity: 'epic',
    slot: 'weapon',
    baseStats: { attack: 4, speed: 5, crit: 3 },
  },
  bow_runicum: {
    id: 'bow_runicum',
    name: 'Łuk Runiczny',
    type: 'weapon',
    rarity: 'legendary',
    slot: 'weapon',
    baseStats: { attack: 5, speed: 7, crit: 4 },
    description: 'Strzały lecą szybciej niż wiatr — łuk mistrzów puszczy.',
  },

  // Staff — heavy hitter (high attack), slower than dagger/bow.
  staff_iron: {
    id: 'staff_iron',
    name: 'Żelazny Kostur',
    type: 'weapon',
    rarity: 'common',
    slot: 'weapon',
    baseStats: { attack: 3 },
  },
  staff_silver: {
    id: 'staff_silver',
    name: 'Srebrny Kostur',
    type: 'weapon',
    rarity: 'uncommon',
    slot: 'weapon',
    baseStats: { attack: 5 },
  },
  staff_mithril: {
    id: 'staff_mithril',
    name: 'Mithrilowy Kostur',
    type: 'weapon',
    rarity: 'rare',
    slot: 'weapon',
    baseStats: { attack: 7 },
  },
  staff_diamond: {
    id: 'staff_diamond',
    name: 'Diamentowy Kostur',
    type: 'weapon',
    rarity: 'epic',
    slot: 'weapon',
    baseStats: { attack: 9 },
  },
  staff_runicum: {
    id: 'staff_runicum',
    name: 'Kostur Runiczny',
    type: 'weapon',
    rarity: 'legendary',
    slot: 'weapon',
    baseStats: { attack: 12 },
    description: 'Kostur runiczny zadaje miażdżące ciosy — broń o najwyższym czystym damage.',
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
  armor_diamond: {
    id: 'armor_diamond',
    name: 'Diamentowa Zbroja',
    type: 'armor',
    rarity: 'epic',
    slot: 'armor',
  },
  armor_runicum: {
    id: 'armor_runicum',
    name: 'Zbroja Runiczna',
    type: 'armor',
    rarity: 'legendary',
    slot: 'armor',
    description: 'Płyty inkrustowane runicum — drop z dungeonów top-tier.',
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
    for (const k of STAT_KEYS) {
      const v = template.baseStats[k];
      if (v !== undefined) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

/** Roluje primary stat bonusy — tylko dla weapon/armor (tool/resource skip). */
function rollPrimaryStats(template: ItemTemplate, rarity: Rarity): ItemPrimary | undefined {
  if (template.type !== 'weapon' && template.type !== 'armor') return undefined;
  const cfg = PRIMARY_RARITY_RANGES[rarity];
  if (cfg.count === 0) return undefined;
  const shuffled = [...PRIMARY_KEYS].sort(() => Math.random() - 0.5).slice(0, cfg.count);
  const out: ItemPrimary = {};
  for (const key of shuffled) {
    out[key] = randIntInclusive(cfg.range[0], cfg.range[1]);
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
  const primary = rollPrimaryStats(tpl, rarity);
  const prefix = RARITY_PREFIX[rarity];
  const name = prefix ? `${prefix} ${tpl.name}` : tpl.name;
  // Diablo-style: drop-y > common przychodzą NIE-zidentyfikowane.
  // Tools (kilof/wędka/siekiera) zawsze zidentyfikowane (nie ma rarity).
  const identified = rarity === 'common' || tpl.type === 'tool';
  return {
    uid: newUid(),
    baseId,
    rarity,
    name,
    stats,
    slot: tpl.slot,
    toolKind: tpl.toolKind,
    toolTier: tpl.toolTier,
    primary,
    identified,
  };
}

/**
 * Crafted items (z `/craft` lub kowala) zawsze zidentyfikowane —
 * gracz włożył pracę w surowce więc nie ma sensu blokować equip.
 */
export function rollCraftedInstance(baseId: string, forcedRarity?: Rarity): ItemInstance | null {
  const it = rollItemInstance(baseId, forcedRarity);
  if (it) it.identified = true;
  return it;
}

export function fmtStats(s: ItemStats): string {
  const parts: string[] = [];
  if (s.attack) parts.push(`+${s.attack} atk`);
  if (s.defense) parts.push(`+${s.defense} def`);
  if (s.hp) parts.push(`+${s.hp} hp`);
  if (s.crit) parts.push(`+${s.crit}% crit`);
  if (s.speed) parts.push(`+${s.speed} spd`);
  return parts.join(', ') || '—';
}

/** Format primary stats — np. "+2 STR, +1 INT". Pusty string gdy brak. */
export function fmtPrimary(p: ItemPrimary | undefined): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.str) parts.push(`+${p.str} STR`);
  if (p.agi) parts.push(`+${p.agi} AGI`);
  if (p.wit) parts.push(`+${p.wit} WIT`);
  if (p.int) parts.push(`+${p.int} INT`);
  return parts.join(', ');
}

/** Liczba zaaplikowanych upgradów (długość listy `upgrades`). 0 = brak. */
export function itemUpgradeLevel(it: ItemInstance): number {
  return it.upgrades?.length ?? 0;
}

/**
 * Wymagany combat lvl do założenia/używania itemu = liczba upgradów.
 * Base item bez upgradów = lvl 0 wymagany (każdy gracz może założyć).
 * Każdy upgrade +1 dorzuca +1 wymaganego combat lvl.
 */
export function itemRequiredLevel(it: ItemInstance): number {
  return itemUpgradeLevel(it);
}

/** Suma bazowych statów + wszystkich upgradów. Source-of-truth dla effective stats. */
export function appliedItemStats(it: ItemInstance): ItemStats {
  if (!it.upgrades || it.upgrades.length === 0) return it.stats;
  const out: ItemStats = { ...it.stats };
  for (const u of it.upgrades) {
    if (u.attack) out.attack = (out.attack ?? 0) + u.attack;
    if (u.defense) out.defense = (out.defense ?? 0) + u.defense;
    if (u.hp) out.hp = (out.hp ?? 0) + u.hp;
    if (u.crit) out.crit = (out.crit ?? 0) + u.crit;
    if (u.speed) out.speed = (out.speed ?? 0) + u.speed;
  }
  return out;
}

/**
 * Roluje pojedynczy upgrade record. DMG +2-3, każdy istniejący stat +1-3
 * (rarity-aware: legendary/epic skłania się do 3, common do 1).
 */
export function rollUpgradeRecord(it: ItemInstance): UpgradeRecord {
  const out: UpgradeRecord = {};
  // DMG bonus zawsze 2-3 — broń skaluje się głównie z atakiem.
  out.attack = randIntInclusive(2, 3);
  // Pozostałe staty istniejące w bazie itemu — bonus 1-3 z rarity bias.
  const [statMin, statMax] = upgradeStatRange(it.rarity);
  for (const k of ['defense', 'hp', 'crit', 'speed'] as const) {
    if ((it.stats[k] ?? 0) > 0) out[k] = randIntInclusive(statMin, statMax);
  }
  return out;
}

function upgradeStatRange(rarity: Rarity): [number, number] {
  switch (rarity) {
    case 'common':
      return [1, 1];
    case 'uncommon':
      return [1, 2];
    case 'rare':
      return [2, 2];
    case 'epic':
      return [2, 3];
    case 'legendary':
      return [3, 3];
  }
}

export function fmtInstance(it: ItemInstance): string {
  const lvl = itemUpgradeLevel(it);
  const upgradeTag = lvl > 0 ? ` **[+${lvl}]**` : '';
  // Diablo-style: nie-zidentyfikowane pokazują tylko name + rarity + req lvl.
  if (it.identified === false) {
    const reqLvl = itemRequiredLevel(it);
    const reqTag = reqLvl > 0 ? ` (req lvl ${reqLvl})` : '';
    return `${RARITY_EMOJI[it.rarity]} **${it.name}**${upgradeTag} _❓ Niezidentyfikowany_${reqTag}`;
  }
  const primaryStr = fmtPrimary(it.primary);
  const statsStr = fmtStats(appliedItemStats(it));
  const combined = primaryStr ? `${statsStr}, ${primaryStr}` : statsStr;
  return `${RARITY_EMOJI[it.rarity]} **${it.name}**${upgradeTag} (${combined})`;
}

export function fmtResource(id: string, qty: number): string {
  const tpl = ITEMS[id];
  const name = tpl?.name ?? id;
  const emoji = tpl ? RARITY_EMOJI[tpl.rarity] : '';
  return `${emoji} ${name} ×${qty}`;
}

/**
 * Cena sprzedaży unikalnego itemu (weapon/armor/tool) do "skupu złomu" —
 * gracz może opylić niechciane itemy z plecaka za złoto. Cena = baza
 * rarity + suma statów × mnożnik rarity. Tool +50% za toolTier > 1.
 *
 * Nie dotyczy resources/consumables — te idą przez `/city sell`.
 */
const RARITY_SELL_BASE: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
  legendary: 500,
};

const RARITY_STAT_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.5,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export function itemSellPrice(it: ItemInstance): number {
  const base = RARITY_SELL_BASE[it.rarity];
  const mult = RARITY_STAT_MULT[it.rarity];
  const applied = appliedItemStats(it);
  const statSum =
    (applied.attack ?? 0) +
    (applied.defense ?? 0) +
    (applied.hp ?? 0) +
    (applied.crit ?? 0) +
    (applied.speed ?? 0);
  let price = base + Math.round(statSum * mult);
  if (it.toolTier && it.toolTier > 1) {
    price = Math.round(price * (1 + (it.toolTier - 1) * 0.5));
  }
  return Math.max(1, price);
}

export const COMBAT_CONSUMABLES = new Set<string>(['potion_small', 'potion_greater']);

export function isCombatConsumable(id: string): boolean {
  return COMBAT_CONSUMABLES.has(id);
}
