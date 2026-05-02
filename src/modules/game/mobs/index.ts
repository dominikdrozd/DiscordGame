import { Mob, type MobTier } from './mob.js';
// Bossy
import { SzczurKuchenny } from './szczur-kuchenny.mob.js';
import { GoblinKucharz } from './goblin-kucharz.mob.js';
import { GoblinLider } from './goblin-lider.mob.js';
import { JadowyPajak } from './jadowy-pajak.mob.js';
import { BabaJaga } from './baba-jaga.mob.js';
import { KsiaznaMroku } from './ksiazna-mroku.mob.js';
import { SmokPolonezowy } from './smok-polonezowy.mob.js';
import { TytanZelaza } from './tytan-zelaza.mob.js';
// Ambush moby
import { GoblinZlomiarz } from './goblin-zlomiarz.mob.js';
import { KupiecZlodziej } from './kupiec-zlodziej.mob.js';
import { WilkSmazony } from './wilk-smazony.mob.js';
import { BandyciZPetlicy } from './bandyci-z-petlicy.mob.js';
import { MafiaZPragi } from './mafia-z-pragi.mob.js';
import { TrolleZBloku } from './trolle-z-bloku.mob.js';
import { OgnistyChochlik } from './ognisty-chochlik.mob.js';
import { MalaStazystkaDemonow } from './mala-stazystka-demonow.mob.js';
import { NiedzielnyKierowca } from './niedzielny-kierowca.mob.js';
import { UpiorZPkp } from './upior-z-pkp.mob.js';

export { Mob };
export type { MobReward, MobTier } from './mob.js';
export { TIER_MULTIPLIERS } from './mob.js';

export const BOSS_MOBS: Record<string, Mob> = {
  szczur_kuchenny: new SzczurKuchenny(),
  goblin_kucharz: new GoblinKucharz(),
  goblin_lider: new GoblinLider(),
  jadowy_pajak: new JadowyPajak(),
  baba_jaga: new BabaJaga(),
  ksiazna_mroku: new KsiaznaMroku(),
  smok_polonezowy: new SmokPolonezowy(),
  tytan_zelaza: new TytanZelaza(),
};

type MobConstructor = new () => Mob;

/**
 * Konstruktory ambush mobów — `randomAmbushMob()` new-uje świeżą instancję
 * przy każdym losowaniu, więc setTier(t) nie wycieka między walkami.
 */
export const AMBUSH_MOB_CLASSES: MobConstructor[] = [
  GoblinZlomiarz,
  KupiecZlodziej,
  WilkSmazony,
  BandyciZPetlicy,
  MafiaZPragi,
  TrolleZBloku,
  OgnistyChochlik,
  MalaStazystkaDemonow,
  NiedzielnyKierowca,
  UpiorZPkp,
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
  const pool = opts.allowedIds && opts.allowedIds.length > 0
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
