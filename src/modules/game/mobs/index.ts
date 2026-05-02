import { Mob, type MobTier } from './mob.js';
// Bosses
import { KitchenRat } from './kitchen-rat.mob.js';
import { GoblinCook } from './goblin-cook.mob.js';
import { GoblinLeader } from './goblin-leader.mob.js';
import { VenomousSpider } from './venomous-spider.mob.js';
import { BabaYaga } from './baba-yaga.mob.js';
import { DarkDuchess } from './dark-duchess.mob.js';
import { PolonezDragon } from './polonez-dragon.mob.js';
import { IronTitan } from './iron-titan.mob.js';
// Ambush mobs
import { ScrapGoblin } from './scrap-goblin.mob.js';
import { ThiefMerchant } from './thief-merchant.mob.js';
import { FriedWolf } from './fried-wolf.mob.js';
import { PetlicaBandits } from './petlica-bandits.mob.js';
import { PragaMafia } from './praga-mafia.mob.js';
import { BlockTrolls } from './block-trolls.mob.js';
import { FireImp } from './fire-imp.mob.js';
import { DemonIntern } from './demon-intern.mob.js';
import { SundayDriver } from './sunday-driver.mob.js';
import { PkpWraith } from './pkp-wraith.mob.js';

export { Mob };
export type { MobReward, MobTier } from './mob.js';
export { TIER_MULTIPLIERS } from './mob.js';

export const BOSS_MOBS: Record<string, Mob> = {
  szczur_kuchenny: new KitchenRat(),
  goblin_kucharz: new GoblinCook(),
  goblin_lider: new GoblinLeader(),
  jadowy_pajak: new VenomousSpider(),
  baba_jaga: new BabaYaga(),
  ksiazna_mroku: new DarkDuchess(),
  smok_polonezowy: new PolonezDragon(),
  tytan_zelaza: new IronTitan(),
};

type MobConstructor = new () => Mob;

/**
 * Konstruktory ambush mobów — `randomAmbushMob()` new-uje świeżą instancję
 * przy każdym losowaniu, więc setTier(t) nie wycieka między walkami.
 */
export const AMBUSH_MOB_CLASSES: MobConstructor[] = [
  ScrapGoblin,
  ThiefMerchant,
  FriedWolf,
  PetlicaBandits,
  PragaMafia,
  BlockTrolls,
  FireImp,
  DemonIntern,
  SundayDriver,
  PkpWraith,
];

/** Lookup id → constructor — używane gdy ekspedycja whitelistuje moby. */
export const AMBUSH_MOB_CLASSES_BY_ID: Record<string, MobConstructor> = (() => {
  const out: Record<string, MobConstructor> = {};
  for (const Ctor of AMBUSH_MOB_CLASSES) {
    const sample = new Ctor();
    out[sample.id] = Ctor;
  }
  return out;
})();

export function getBossMob(id: string): Mob | undefined {
  return BOSS_MOBS[id];
}

export interface RandomAmbushOpts {
  /** explicit tier — pomija wszelkie inne reguły */
  tier?: MobTier;
  /** whitelist id mobów (filtruje pulę). Jeśli pusta lista lub brak → wszystkie. */
  allowedIds?: string[];
  /** whitelist tierów. Jeśli ustawione → losuje z listy zamiast `tier`. */
  allowedTiers?: MobTier[];
}

export function randomAmbushMob(opts: RandomAmbushOpts = {}): Mob {
  const pool =
    opts.allowedIds && opts.allowedIds.length > 0
      ? opts.allowedIds.map((id) => AMBUSH_MOB_CLASSES_BY_ID[id]).filter(Boolean)
      : AMBUSH_MOB_CLASSES;
  const Ctor = pool[Math.floor(Math.random() * pool.length)] ?? AMBUSH_MOB_CLASSES[0];
  const mob = new Ctor();
  let tier = opts.tier;
  if (tier === undefined && opts.allowedTiers && opts.allowedTiers.length > 0) {
    tier = opts.allowedTiers[Math.floor(Math.random() * opts.allowedTiers.length)];
  }
  if (tier !== undefined) mob.setTier(tier);
  return mob;
}

/**
 * Mapuje combat level gracza na tier ambush moba.
 *
 * Algorytm: każdy combat lvl 8 podnosi base tier o 1 (clamped 1-5).
 * Wokół base losujemy z rozkładem 70/20/10:
 *   - 70% szansa na base tier (sweet spot — challenge match-up)
 *   - 20% szansa na base-1 (łatwiejszy — chwila oddechu)
 *   - 10% szansa na base+1 (trudniejszy — niespodzianka, większy reward)
 *
 * Dzięki temu nowy gracz (combat lvl 1-7) prawie zawsze trafi na T1,
 * a doświadczony (combat lvl 32+) głównie na T5 z okazjonalnym T4.
 */
export function ambushTierForLevel(combatLvl: number): MobTier {
  const base = Math.min(5, Math.max(1, Math.floor(combatLvl / 8) + 1)) as MobTier;
  const r = Math.random();
  if (r < 0.7) return base;
  if (r < 0.9) return Math.max(1, base - 1) as MobTier;
  return Math.min(5, base + 1) as MobTier;
}
