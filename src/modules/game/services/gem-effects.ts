import type { GemElement, GemSize } from './items.js';
import { ITEMS } from './items.js';
import type { PlayerStats, PlayerStatsService } from './player-stats.js';

/**
 * Statyki proceeu gemu w broni (offensive). Identyczne dla wszystkich
 * elementów (fire/ice/poison) — różni się tylko aplikowany buff
 * (burn/slow/poison).
 */
const WEAPON_BY_SIZE: Record<GemSize, { bonusDmg: number; procChance: number }> = {
  small: { bonusDmg: 1, procChance: 0.04 },
  medium: { bonusDmg: 3, procChance: 0.06 },
  large: { bonusDmg: 5, procChance: 0.09 },
  huge: { bonusDmg: 8, procChance: 0.12 },
};

/** Buff aplikowany przy procu gemu w broni. amount/ttl identyczne dla każdego size — "nie zwiekszamy tika". */
const WEAPON_BUFF_BY_ELEMENT: Record<
  GemElement,
  { kind: 'dot' | 'slow'; id: string; amount: number; ttl: number; source: string }
> = {
  fire: { kind: 'dot', id: 'gem_burn', amount: 4, ttl: 3, source: 'Podpalenie' },
  ice: { kind: 'slow', id: 'gem_slow', amount: 6, ttl: 2, source: 'Mróz' },
  poison: { kind: 'dot', id: 'gem_poison', amount: 3, ttl: 4, source: 'Trucizna' },
};

/** Defensywne staty gemu w pancerzu (per element × size). */
const ARMOR_BY_ELEMENT_SIZE: Record<
  GemElement,
  Record<GemSize, { hp?: number; defense?: number; hotAmount?: number }>
> = {
  fire: {
    small: { hp: 8 },
    medium: { hp: 15 },
    large: { hp: 25 },
    huge: { hp: 40 },
  },
  ice: {
    small: { defense: 1 },
    medium: { defense: 2 },
    large: { defense: 3 },
    huge: { defense: 4 },
  },
  poison: {
    small: { hotAmount: 3 },
    medium: { hotAmount: 5 },
    large: { hotAmount: 8 },
    huge: { hotAmount: 12 },
  },
};

/** Primary stat z gemu w narzędziu. fire→STR, ice→AGI, poison→INT. */
const TOOL_BY_ELEMENT: Record<GemElement, 'str' | 'agi' | 'int'> = {
  fire: 'str',
  ice: 'agi',
  poison: 'int',
};

const TOOL_AMOUNT_BY_SIZE: Record<GemSize, number> = {
  small: 1,
  medium: 2,
  large: 3,
  huge: 5,
};

export interface WeaponGemEffect {
  bonusDmg: number;
  procChance: number;
  buff: { kind: 'dot' | 'slow'; id: string; amount: number; ttl: number; source: string };
  element: GemElement;
}

export interface ArmorGemEffect {
  hp?: number;
  defense?: number;
  /** HP regen per tick — period=2 (co 2 tury) dla green/poison. */
  hotAmount?: number;
}

export interface ToolGemEffect {
  primary: 'str' | 'agi' | 'int';
  amount: number;
}

/**
 * Parsuje gem id (np. 'gem_fire_huge') na element + size. Memoized — 12
 * unikalnych ID gemów + cache dla niezmieniających się non-gem strings,
 * więc combat/UI hot path nie wykonuje regex per-call.
 */
const GEM_ID_CACHE = new Map<string, { element: GemElement; size: GemSize } | null>();

export function parseGemId(id: string): { element: GemElement; size: GemSize } | null {
  const cached = GEM_ID_CACHE.get(id);
  if (cached !== undefined) return cached;
  const match = /^gem_(fire|ice|poison)_(small|medium|large|huge)$/.exec(id);
  const result = match
    ? { element: match[1] as GemElement, size: match[2] as GemSize }
    : null;
  GEM_ID_CACHE.set(id, result);
  return result;
}

export function gemWeaponEffect(id: string): WeaponGemEffect | null {
  const parsed = parseGemId(id);
  if (!parsed) return null;
  const stats = WEAPON_BY_SIZE[parsed.size];
  return {
    bonusDmg: stats.bonusDmg,
    procChance: stats.procChance,
    buff: WEAPON_BUFF_BY_ELEMENT[parsed.element],
    element: parsed.element,
  };
}

export function gemArmorEffect(id: string): ArmorGemEffect | null {
  const parsed = parseGemId(id);
  if (!parsed) return null;
  return ARMOR_BY_ELEMENT_SIZE[parsed.element][parsed.size];
}

export function gemToolEffect(id: string): ToolGemEffect | null {
  const parsed = parseGemId(id);
  if (!parsed) return null;
  return {
    primary: TOOL_BY_ELEMENT[parsed.element],
    amount: TOOL_AMOUNT_BY_SIZE[parsed.size],
  };
}

/** True dla każdego ID pasującego do gem_(fire|ice|poison)_(small|medium|large|huge). */
export function isGemId(id: string): boolean {
  return parseGemId(id) !== null;
}

const GEM_SIZES_ALL: GemSize[] = ['small', 'medium', 'large', 'huge'];
const GEM_ELEMENTS_ALL: GemElement[] = ['fire', 'ice', 'poison'];

/**
 * Drop chance per (tier, size). Gemy droppują od T2+. T1 = 0%.
 * T2: 2.5/1.25/0.625/0.125; T5: 2.5/2.5/2.5/2.5. 4 niezależne rolle per
 * source — przy T5 ~10% expected drops per event (~1 gem co 10 eventów).
 */
export function gemDropChance(tier: number, size: GemSize): number {
  if (tier < 2) return 0;
  const base: Record<GemSize, number> = {
    small: 2.5,
    medium: 1.25,
    large: 0.625,
    huge: 0.125,
  };
  const cap = 2.5;
  const ratio = (tier - 2) / 3;
  return base[size] + (cap - base[size]) * ratio;
}

/** Format chances per tier dla UI: `S 10% · M 7% · L 5% · H 4%`. T<2 zwraca ''. */
export function fmtGemDropChances(tier: number): string {
  if (tier < 2) return '';
  const fmt = (s: GemSize): string =>
    gemDropChance(tier, s).toFixed(gemDropChance(tier, s) % 1 === 0 ? 0 : 1);
  return `S ${fmt('small')}% · M ${fmt('medium')}% · L ${fmt('large')}% · H ${fmt('huge')}%`;
}

/**
 * Roluje gem drops dla pojedynczej event-source (claim ekspedycji,
 * kill bossa dungeon, kill world-boss). Każdy size rolluje niezależnie
 * (mała szansa kilku gemów na raz). Element losowany 1/3 per drop.
 *
 * Zwraca array gem-id które wylosowały drop (np. ['gem_fire_small']).
 */
export function rollGemDrops(tier: number): string[] {
  const out: string[] = [];
  for (const size of GEM_SIZES_ALL) {
    const chance = gemDropChance(tier, size);
    if (chance <= 0) continue;
    if (Math.random() * 100 < chance) {
      const element = GEM_ELEMENTS_ALL[Math.floor(Math.random() * GEM_ELEMENTS_ALL.length)];
      out.push(`gem_${element}_${size}`);
    }
  }
  return out;
}

/**
 * Roluje gem drops i wrzuca je do plecaka gracza. Zwraca line do log/summary
 * (puste gdy nic nie wypadło). Wspólne dla expedition/dungeon/boss/world-boss.
 */
export function awardGemDrops(
  stats: PlayerStatsService,
  player: PlayerStats,
  tier: number,
): string[] {
  const drops = rollGemDrops(tier);
  if (drops.length === 0) return [];
  const lines: string[] = [];
  for (const gemId of drops) {
    stats.addResource(player, gemId, 1);
    const tpl = ITEMS[gemId];
    lines.push(`💎 ${tpl?.name ?? gemId}`);
  }
  return lines;
}

