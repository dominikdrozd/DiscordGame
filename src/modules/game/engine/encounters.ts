import type { CombatAction, Combatant } from './combat.js';
import type { LootEntry } from '../services/loot.js';
import { BOSS_MOBS } from '../mobs/index.js';
import type { MobReward, MobTier } from '../mobs/index.js';

/** alias zachowany dla wstecznej zgodności z istniejącymi konsumentami nagród */
export type BossReward = MobReward;

export interface DungeonDef {
  id: string;
  name: string;
  description: string;
  rooms: string[];
  finalReward: BossReward;
  /**
   * Tier wszystkich mobów w dungeonie. Każdy boss z `rooms[]` zostanie
   * `setTier()`-iowany przed `toCombatant()`. Final room (ostatni) dostaje
   * dodatkowo +1 do tieru (clamped do 5) — boss-fight bump.
   */
  baseTier: MobTier;
  /**
   * Minimalna liczba członków party wymagana do wejścia. Wszystkie dungeony
   * domyślnie 2 (po decyzji "wszystkie dungeony party-only"). Można podbić
   * dla endgame contentu.
   */
  minPartySize: number;
  /** Wymagany combat lvl LIDERA party (najwyższy w grupie też się liczy). */
  requiredCombatLevel?: number;
}

/** Tier z podbiciem dla finałowego pokoju — clamped do 1-5. */
export function dungeonRoomTier(def: DungeonDef, roomIndex: number): MobTier {
  const isFinal = roomIndex === def.rooms.length - 1;
  const raw = def.baseTier + (isFinal ? 1 : 0);
  if (raw <= 1) return 1;
  if (raw === 2) return 2;
  if (raw === 3) return 3;
  if (raw === 4) return 4;
  return 5;
}

/** rejestr bossów — re-export `BOSS_MOBS` z `mobs/`. Konsumenci używają `mob.toCombatant()`. */
export const BOSSES = BOSS_MOBS;

export const DUNGEONS: Record<string, DungeonDef> = {
  // ── R1 / baseTier 2 — startowe dungeony party-friendly ───
  spizarnia_babci: {
    id: 'spizarnia_babci',
    name: 'Spiżarnia Babci',
    description: '3 pokoje + finałowy przeciwnik. Babcia nie wybacza.',
    rooms: ['szczur_kuchenny', 'goblin_kucharz', 'baba_jaga'],
    baseTier: 2,
    minPartySize: 2,
    finalReward: {
      xp: 500,
      combatXp: 300,
      lootTable: [
        { itemId: 'ore_silver', weight: 40, qtyMin: 2, qtyMax: 3 },
        { itemId: 'gem_ruby', weight: 30, qtyMin: 1, qtyMax: 2 },
        { itemId: 'gem_diamond', weight: 15 },
        { itemId: 'potion_greater', weight: 15 },
      ],
      rolls: 3,
      dropPool: [
        'sword_silver',
        'dagger_silver',
        'bow_silver',
        'staff_silver',
        'armor_silver',
      ],
      guaranteedDropChance: 1,
    },
  },
  zatopiony_wrak: {
    id: 'zatopiony_wrak',
    name: 'Zatopiony Wrak',
    description: 'Wrak portowego okrętu na dnie zatoki — 3 pokoje, na końcu Latający Holender.',
    rooms: ['szczur_kuchenny', 'jadowy_pajak', 'latajacy_holender'],
    baseTier: 2,
    minPartySize: 2,
    finalReward: {
      xp: 600,
      combatXp: 350,
      lootTable: [
        { itemId: 'ore_iron', weight: 30, qtyMin: 2, qtyMax: 4 },
        { itemId: 'fish_marlin', weight: 25 },
        { itemId: 'gem_ruby', weight: 25, qtyMin: 1, qtyMax: 2 },
        { itemId: 'potion_greater', weight: 20 },
      ],
      rolls: 4,
      dropPool: [
        'sword_iron',
        'dagger_iron',
        'bow_iron',
        'staff_iron',
        'armor_iron',
        'sword_silver',
        'dagger_silver',
      ],
      guaranteedDropChance: 1,
    },
  },

  // ── R2 / baseTier 3 ────────────────────────────────────
  debowe_korzenie: {
    id: 'debowe_korzenie',
    name: 'Dębowe Korzenie',
    description: 'Sieć korytarzy pod świętym dębem Oakhaven — 4 pokoje, finał z Leszym Rogatym.',
    rooms: ['goblin_lider', 'jadowy_pajak', 'baba_jaga', 'leszy_rogaty'],
    baseTier: 3,
    minPartySize: 2,
    requiredCombatLevel: 16,
    finalReward: {
      xp: 1000,
      combatXp: 550,
      lootTable: [
        { itemId: 'ore_silver', weight: 25, qtyMin: 2, qtyMax: 4 },
        { itemId: 'ore_gold', weight: 25, qtyMin: 1, qtyMax: 2 },
        { itemId: 'wood_heban', weight: 20, qtyMin: 1, qtyMax: 2 },
        { itemId: 'gem_emerald', weight: 20, qtyMin: 1, qtyMax: 2 },
        { itemId: 'gem_ruby', weight: 10, qtyMin: 1, qtyMax: 2 },
      ],
      rolls: 5,
      dropPool: [
        'sword_silver',
        'dagger_silver',
        'bow_silver',
        'staff_silver',
        'armor_silver',
        'sword_mithril',
        'dagger_mithril',
      ],
      guaranteedDropChance: 1,
    },
  },

  // ── R3 / baseTier 4 ────────────────────────────────────
  mrozna_cytadela: {
    id: 'mrozna_cytadela',
    name: 'Mroźna Cytadela',
    description:
      'Lodowy bastion na szczycie Krasnoludzkiej Twierdzy — 4 pokoje, finał z Mrozowym Olbrzymem.',
    rooms: ['baba_jaga', 'ksiazna_mroku', 'baba_jaga', 'mrozowy_olbrzym'],
    baseTier: 4,
    minPartySize: 3,
    requiredCombatLevel: 24,
    finalReward: {
      xp: 1800,
      combatXp: 950,
      lootTable: [
        { itemId: 'ore_mithril', weight: 25, qtyMin: 2, qtyMax: 3 },
        { itemId: 'gem_sapphire', weight: 25, qtyMin: 1, qtyMax: 2 },
        { itemId: 'gem_diamond', weight: 20, qtyMin: 1, qtyMax: 2 },
        { itemId: 'wood_smoczy', weight: 15, qtyMin: 1, qtyMax: 2 },
        { itemId: 'potion_greater', weight: 15, qtyMin: 1, qtyMax: 2 },
      ],
      rolls: 6,
      dropPool: [
        'sword_mithril',
        'dagger_mithril',
        'bow_mithril',
        'staff_mithril',
        'armor_mithril',
        'sword_diamond',
        'staff_diamond',
        'armor_diamond',
      ],
      guaranteedDropChance: 1,
    },
  },
  smocza_dziupla: {
    id: 'smocza_dziupla',
    name: 'Smocza Dziupla',
    description: '4 pokoje, na końcu Smok Polonezowy. Tylko dla wytrwałych.',
    rooms: ['goblin_kucharz', 'baba_jaga', 'baba_jaga', 'smok_polonezowy'],
    baseTier: 4,
    minPartySize: 3,
    requiredCombatLevel: 24,
    finalReward: {
      xp: 1500,
      combatXp: 800,
      lootTable: [
        { itemId: 'ore_mithril', weight: 35, qtyMin: 2, qtyMax: 3 },
        { itemId: 'gem_diamond', weight: 25, qtyMin: 1, qtyMax: 2 },
        { itemId: 'gem_sapphire', weight: 20, qtyMin: 1, qtyMax: 2 },
        { itemId: 'wood_smoczy', weight: 20, qtyMin: 1, qtyMax: 2 },
      ],
      rolls: 5,
      dropPool: [
        'sword_mithril',
        'dagger_mithril',
        'bow_mithril',
        'staff_mithril',
        'armor_mithril',
        'sword_diamond',
        'bow_diamond',
      ],
      guaranteedDropChance: 1,
    },
  },

  // ── R4 / baseTier 5 — endgame, full party 4 ────────────
  krypta_lichow: {
    id: 'krypta_lichow',
    name: 'Krypta Lichów',
    description:
      'Ultymatywny dungeon Czarnej Cytadeli — 5 pokoi z najpotężniejszymi bossami, na końcu Lich Wielki.',
    rooms: ['ksiazna_mroku', 'tytan_zelaza', 'smok_polonezowy', 'mrozowy_olbrzym', 'lich_wielki'],
    baseTier: 5,
    minPartySize: 4,
    requiredCombatLevel: 32,
    finalReward: {
      xp: 4000,
      combatXp: 2200,
      lootTable: [
        { itemId: 'gem_diamond', weight: 25, qtyMin: 2, qtyMax: 4 },
        { itemId: 'gem_emerald', weight: 25, qtyMin: 1, qtyMax: 3 },
        { itemId: 'gem_sapphire', weight: 20, qtyMin: 1, qtyMax: 3 },
        { itemId: 'wood_swiatowe', weight: 15, qtyMin: 1, qtyMax: 2 },
        { itemId: 'potion_greater', weight: 15, qtyMin: 2, qtyMax: 3 },
      ],
      rolls: 8,
      dropPool: [
        'sword_diamond',
        'dagger_diamond',
        'bow_diamond',
        'staff_diamond',
        'armor_diamond',
        'sword_runicum',
        'dagger_runicum',
        'bow_runicum',
        'staff_runicum',
        'armor_runicum',
      ],
      guaranteedDropChance: 1,
    },
  },
};

export function chooseBossAction(boss: Combatant): CombatAction {
  const hpRatio = boss.hp / boss.maxHp;
  if (hpRatio < 0.3 && boss.potionsLeft > 0 && Math.random() < 0.6) return 'potion';
  if (Math.random() < 0.2) return 'defend';
  return 'attack';
}

export interface ExpeditionDef {
  id: string;
  name: string;
  description: string;
  region: 1 | 2 | 3 | 4;
  regionName: string;
  tier: 1 | 2 | 3 | 4 | 5;
  durationMs: number;
  lootTable: LootEntry[];
  rolls: number;
  xp: number;
  combatXp?: number;
  dropPool?: string[];
  guaranteedDropChance?: number;
  /** id mobów które mogą zaatakować w tej ekspedycji (subset AMBUSH). Brak → wszystkie. */
  ambushMobIds?: string[];
}

export const REGION_NAMES: Record<1 | 2 | 3 | 4, string> = {
  1: 'Wybrzeże Szeptów',
  2: 'Serce Quelthasee',
  3: 'Żelazne Szczyty',
  4: 'Przeklęta Północ',
};

/** Combat level wymagany żeby wejść do regionu (zarówno do ekspedycji jak i miast). */
export const REGION_LVL_REQ: Record<1 | 2 | 3 | 4, number> = {
  1: 1,
  2: 8,
  3: 16,
  4: 24,
};

/** Mapuje tier ekspedycji na string-zakres rekomendowanego combat lvl ("1-7" etc.). */
export function expeditionLvlBracket(tier: 1 | 2 | 3 | 4 | 5): string {
  const ranges: Record<typeof tier, string> = {
    1: '1-7',
    2: '8-15',
    3: '16-23',
    4: '24-31',
    5: '32+',
  };
  return ranges[tier];
}

/** Minimalny combat lvl wymagany do ekspedycji o danym tierze. */
export function expeditionMinLvl(tier: 1 | 2 | 3 | 4 | 5): number {
  return Math.max(1, (tier - 1) * 8);
}

/**
 * Maksymalny "własny" lvl ekspedycji (top of bracket). Mnożony przez
 * `tier` daje cap dla itemLevel dropu z dropPool — T1 może upuścić item
 * lvl ≤ 7, T5 ≤ 200 (40 × 5). Items o wyższym lvl mają wyższe req combat
 * lvl i lekko podbite staty (sqrt scaling w `rollItemInstance`).
 */
export function expeditionMaxLvl(tier: 1 | 2 | 3 | 4 | 5): number {
  const maxes: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 7, 2: 15, 3: 23, 4: 31, 5: 40 };
  return maxes[tier];
}

/**
 * Czas trwania ekspedycji per tier — szybkie tempo dla niskich tierów,
 * dłuższe wyprawy = większy reward dla wyższych. T1=5min → T5=25min.
 * Uzasadnienie: gracz nowy zbiera szybko cykle i learning loop, gracz
 * doświadczony dostaje "set & forget" dłuższe sesje.
 */
export function expeditionDurationMs(tier: 1 | 2 | 3 | 4 | 5): number {
  return tier * 5 * 60_000;
}

export const EXPEDITIONS: Record<string, ExpeditionDef> = {
  // ── REGION I — Wybrzeże Szeptów (T1) ──────────────
  slonechna_plaza: {
    id: 'slonechna_plaza',
    name: 'Słoneczna Plaża',
    description: 'Piaszczysty brzeg pełen krabów i skarbów wyrzuconych przez morze.',
    region: 1,
    regionName: REGION_NAMES[1],
    tier: 1,
    durationMs: expeditionDurationMs(1),
    lootTable: [
      { itemId: 'fish_sardynka', weight: 35, qtyMin: 2, qtyMax: 4 },
      { itemId: 'fish_karp', weight: 30, qtyMin: 1, qtyMax: 3 },
      { itemId: 'ore_copper', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 10 },
    ],
    rolls: 4,
    xp: 70,
  },
  gaj_nowicjusza: {
    id: 'gaj_nowicjusza',
    name: 'Gaj Nowicjusza',
    description: 'Gęsty las liściasty dla początkujących podróżników.',
    region: 1,
    regionName: REGION_NAMES[1],
    tier: 1,
    durationMs: expeditionDurationMs(1),
    lootTable: [
      { itemId: 'wood_sosna', weight: 50, qtyMin: 3, qtyMax: 6 },
      { itemId: 'wood_dab', weight: 35, qtyMin: 2, qtyMax: 4 },
      { itemId: 'fish_karp', weight: 15, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 4,
    xp: 80,
  },
  slonechny_kamieniolom: {
    id: 'slonechny_kamieniolom',
    name: 'Słoneczny Kamieniołom',
    description: 'Miejsce wydobycia miedzi i żelaza.',
    region: 1,
    regionName: REGION_NAMES[1],
    tier: 1,
    durationMs: expeditionDurationMs(1),
    lootTable: [
      { itemId: 'ore_copper', weight: 45, qtyMin: 3, qtyMax: 5 },
      { itemId: 'ore_iron', weight: 35, qtyMin: 2, qtyMax: 4 },
      { itemId: 'wood_sosna', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 5,
    xp: 130,
  },
  zapomniana_grota: {
    id: 'zapomniana_grota',
    name: 'Zapomniana Grota',
    description: 'Mroczna jaskinia będąca siedliskiem pająków.',
    region: 1,
    regionName: REGION_NAMES[1],
    tier: 2,
    durationMs: expeditionDurationMs(2),
    lootTable: [
      { itemId: 'ore_iron', weight: 35, qtyMin: 2, qtyMax: 4 },
      { itemId: 'ore_silver', weight: 30, qtyMin: 1, qtyMax: 3 },
      { itemId: 'gem_diamond', weight: 15 },
      { itemId: 'wood_buk', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 5,
    xp: 220,
    combatXp: 100,
    dropPool: ['sword_iron', 'dagger_iron', 'bow_iron', 'staff_iron', 'armor_iron'],
    guaranteedDropChance: 0.4,
  },

  // ── REGION II — Serce Quelthasee (T2-T3) ──────────
  trakt_kupiecki: {
    id: 'trakt_kupiecki',
    name: 'Trakt Kupiecki',
    description: 'Szlak handlowy łączący wschód z zachodem.',
    region: 2,
    regionName: REGION_NAMES[2],
    tier: 2,
    durationMs: expeditionDurationMs(2),
    lootTable: [
      { itemId: 'ore_iron', weight: 30, qtyMin: 2, qtyMax: 4 },
      { itemId: 'ore_silver', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_dab', weight: 25, qtyMin: 2, qtyMax: 3 },
      { itemId: 'fish_szczupak', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 5,
    xp: 200,
    dropPool: ['sword_iron', 'dagger_iron', 'bow_iron', 'staff_iron', 'armor_iron'],
    guaranteedDropChance: 0.3,
  },
  szepczacy_las: {
    id: 'szepczacy_las',
    name: 'Szepczący Las',
    description: 'Tajemnicza puszcza zamieszkana przez magiczne istoty.',
    region: 2,
    regionName: REGION_NAMES[2],
    tier: 2,
    durationMs: expeditionDurationMs(2),
    lootTable: [
      { itemId: 'wood_buk', weight: 35, qtyMin: 2, qtyMax: 3 },
      { itemId: 'wood_heban', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 15 },
      { itemId: 'wood_dab', weight: 25, qtyMin: 2, qtyMax: 3 },
    ],
    rolls: 5,
    xp: 220,
    combatXp: 80,
  },
  jezioro_luster: {
    id: 'jezioro_luster',
    name: 'Jezioro Luster',
    description: 'Czysty akwen, idealny do łowienia rzadkich ryb.',
    region: 2,
    regionName: REGION_NAMES[2],
    tier: 2,
    durationMs: expeditionDurationMs(2),
    lootTable: [
      { itemId: 'fish_szczupak', weight: 35, qtyMin: 2, qtyMax: 4 },
      { itemId: 'fish_sum', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'fish_karp', weight: 30, qtyMin: 2, qtyMax: 3 },
      { itemId: 'fish_marlin', weight: 10 },
    ],
    rolls: 5,
    xp: 180,
  },
  zrujnowana_straznica: {
    id: 'zrujnowana_straznica',
    name: 'Zrujnowana Strażnica',
    description: 'Pozostałości dawnych fortyfikacji, teraz opanowane przez potwory.',
    region: 2,
    regionName: REGION_NAMES[2],
    tier: 3,
    durationMs: expeditionDurationMs(3),
    lootTable: [
      { itemId: 'ore_silver', weight: 35, qtyMin: 2, qtyMax: 3 },
      { itemId: 'ore_iron', weight: 30, qtyMin: 2, qtyMax: 4 },
      { itemId: 'gem_diamond', weight: 20, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_heban', weight: 15, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 6,
    xp: 380,
    combatXp: 180,
    dropPool: ['sword_silver', 'dagger_silver', 'bow_silver', 'staff_silver', 'armor_silver'],
    guaranteedDropChance: 0.5,
  },
  glebokie_moczary: {
    id: 'glebokie_moczary',
    name: 'Głębokie Moczary',
    description: 'Bagienny teren pełen topielców i rzadkich ziół.',
    region: 2,
    regionName: REGION_NAMES[2],
    tier: 3,
    durationMs: expeditionDurationMs(3),
    lootTable: [
      { itemId: 'wood_heban', weight: 30, qtyMin: 1, qtyMax: 3 },
      { itemId: 'fish_sum', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 20 },
      { itemId: 'ore_silver', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 5,
    xp: 320,
    combatXp: 140,
  },

  // ── REGION III — Żelazne Szczyty (T3-T4) ──────────
  przelecz_gromu: {
    id: 'przelecz_gromu',
    name: 'Przełęcz Gromu',
    description: 'Niebezpieczna droga górska nękana przez harpie.',
    region: 3,
    regionName: REGION_NAMES[3],
    tier: 3,
    durationMs: expeditionDurationMs(3),
    lootTable: [
      { itemId: 'ore_silver', weight: 30, qtyMin: 2, qtyMax: 3 },
      { itemId: 'ore_gold', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_smoczy', weight: 20 },
    ],
    rolls: 6,
    xp: 400,
    combatXp: 200,
    dropPool: ['sword_silver', 'dagger_silver', 'bow_silver', 'staff_silver', 'armor_silver'],
    guaranteedDropChance: 0.5,
  },
  kopalnia_glebi: {
    id: 'kopalnia_glebi',
    name: 'Kopalnia Głębi',
    description: 'Najgłębsze tunele, gdzie wydobywa się złoto i drogocenne kruszce.',
    region: 3,
    regionName: REGION_NAMES[3],
    tier: 3,
    durationMs: expeditionDurationMs(3),
    lootTable: [
      { itemId: 'ore_gold', weight: 35, qtyMin: 1, qtyMax: 3 },
      { itemId: 'ore_mithril', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'ore_silver', weight: 20, qtyMin: 2, qtyMax: 4 },
      { itemId: 'gem_diamond', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 6,
    xp: 450,
    combatXp: 150,
    dropPool: [
      'sword_silver',
      'dagger_silver',
      'bow_silver',
      'staff_silver',
      'armor_mithril',
    ],
    guaranteedDropChance: 0.55,
  },
  mrozny_las: {
    id: 'mrozny_las',
    name: 'Mroźny Las',
    description: 'Ośnieżony biom iglasty, dom lodowych trolli.',
    region: 3,
    regionName: REGION_NAMES[3],
    tier: 4,
    durationMs: expeditionDurationMs(4),
    lootTable: [
      { itemId: 'wood_smoczy', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'ore_mithril', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_heban', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 6,
    xp: 600,
    combatXp: 250,
    dropPool: ['sword_mithril', 'dagger_mithril', 'bow_mithril', 'staff_mithril', 'armor_mithril'],
    guaranteedDropChance: 0.6,
  },
  krysztalowa_jaskinia: {
    id: 'krysztalowa_jaskinia',
    name: 'Kryształowa Jaskinia',
    description: 'Lśniące podziemia pełne magicznych kryształów.',
    region: 3,
    regionName: REGION_NAMES[3],
    tier: 3,
    durationMs: expeditionDurationMs(3),
    lootTable: [
      { itemId: 'gem_diamond', weight: 50, qtyMin: 2, qtyMax: 3 },
      { itemId: 'ore_mithril', weight: 25, qtyMin: 1, qtyMax: 2 },
      { itemId: 'ore_silver', weight: 25, qtyMin: 2, qtyMax: 3 },
    ],
    rolls: 5,
    xp: 420,
    combatXp: 100,
    dropPool: ['sword_silver', 'dagger_silver', 'bow_silver', 'staff_silver', 'armor_silver'],
    guaranteedDropChance: 0.45,
  },

  // ── REGION IV — Przeklęta Północ (T4-T5) ──────────
  dolina_cieni: {
    id: 'dolina_cieni',
    name: 'Dolina Cieni',
    description: 'Jałowa kraina nawiedzana przez duchy i upiory.',
    region: 4,
    regionName: REGION_NAMES[4],
    tier: 4,
    durationMs: expeditionDurationMs(4),
    lootTable: [
      { itemId: 'ore_mithril', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 35, qtyMin: 1, qtyMax: 3 },
      { itemId: 'wood_smoczy', weight: 20, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_swiatowe', weight: 15 },
    ],
    rolls: 6,
    xp: 750,
    combatXp: 300,
    dropPool: ['sword_mithril', 'dagger_mithril', 'bow_mithril', 'staff_mithril', 'armor_mithril'],
    guaranteedDropChance: 0.7,
  },
  martwy_las: {
    id: 'martwy_las',
    name: 'Martwy Las',
    description: 'Las uschniętych drzew, w którym czai się mrok.',
    region: 4,
    regionName: REGION_NAMES[4],
    tier: 4,
    durationMs: expeditionDurationMs(4),
    lootTable: [
      { itemId: 'wood_swiatowe', weight: 25 },
      { itemId: 'wood_smoczy', weight: 30, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_heban', weight: 25, qtyMin: 2, qtyMax: 3 },
      { itemId: 'gem_diamond', weight: 20, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 6,
    xp: 700,
    combatXp: 200,
  },
  smocze_gniazdo: {
    id: 'smocze_gniazdo',
    name: 'Smocze Gniazdo',
    description: 'Wulkaniczny szczyt, legowisko najpotężniejszego bossa kontynentu.',
    region: 4,
    regionName: REGION_NAMES[4],
    tier: 5,
    durationMs: expeditionDurationMs(5),
    lootTable: [
      { itemId: 'ore_mithril', weight: 35, qtyMin: 2, qtyMax: 3 },
      { itemId: 'wood_smoczy', weight: 25, qtyMin: 1, qtyMax: 3 },
      { itemId: 'wood_swiatowe', weight: 20, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 20, qtyMin: 2, qtyMax: 3 },
    ],
    rolls: 7,
    xp: 1500,
    combatXp: 600,
    dropPool: ['sword_mithril', 'dagger_mithril', 'bow_mithril', 'staff_mithril', 'armor_mithril'],
    guaranteedDropChance: 0.85,
  },
};
