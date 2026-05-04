import {
  getDamageAmp,
  getDefenseAmp,
  consumeShield,
  getLifestealPercent,
  getEvasionPercent,
  getCritAmp,
  addBuff,
} from './buffs.js';
import type { PrimaryStats } from '../services/player-stats.js';
import type { WeaponGemEffect } from '../services/gem-effects.js';
import type { GemElement } from '../services/items.js';

export const ATTACK_NAMES = [
  'Cios Zatrutego Pieroga',
  'Pięść Babci Genowefy',
  'Obuchowa Krytyka Konstruktywna',
  'Sztos Spod Żabki',
  'Karate z OLX',
  'Rzut Kapciem Mama-Style',
  'Atomowy Kebab',
  'Cios Spod Krzaka',
  'Łokieć Ojczyma',
  'Cios Niedzielnego Kierowcy',
  'Pięść Skarbówki',
  'Masakryczne Pukanie do Drzwi',
  'Headbutt z Polonezu',
  'Pierdolnięcie z Główki',
  'Słynne Spadanie ze Schodów',
  'Atak Wkurwionego Listonosza',
  'Pluń-i-Rzuć Combo',
  'Krzywy Hak Janusza',
  'Smażony Suplex',
  'Spaghetti Kombo',
];

export const DODGE_NAMES = [
  'Unik Rodem z Matrixa',
  'Nelson z PRL-u',
  'Bałtycki Salto',
  'Wykręt Kierowcy Ubera',
  'Ucieczka Spod Mandatu',
  'Kucnięcie z Klasą',
  'Slow-Motion á la Hołowczyc',
  'Wślizg w Lewo',
];

export const DEFEND_NAMES = [
  'Mur Babci',
  'Tarcza Tupperware',
  'Zasłona Mgielna z Lidla',
  'Plecak Reklamówka',
  'Garda z Trzpotów',
  'Ojcowska Krzywizna',
];

export const POTION_NAMES = [
  'Bimber Dziadka',
  'Witamina C z Apteki',
  'Nalewka na Pigwie',
  'Energetyk Tiger',
  'Rosół Mamy',
  'Kawa z Ziaren Janusza',
];

export const POTIONS_START = 2;
export const POTION_HEAL = 25;
export const GREATER_POTION_HEAL = 60;
export const DODGE_CHANCE = 0.15;
export const BLOCK_CHANCE = 0.75;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULTIPLIER = 2;

export type CombatActionKind = 'attack' | 'defend' | 'item';
// alias zachowany dla wstecznej zgodności
export type CombatAction = CombatActionKind | 'potion';

export interface BattleAction {
  kind: CombatActionKind;
  itemId?: string;
}

export interface Combatant {
  id?: string;
  name: string;
  hp: number;
  maxHp: number;
  damageBonus: number;
  defenseBonus?: number;
  critBonus?: number;
  /** Inicjatywa — wyższy speed = atakuje pierwszy w fazach skill/item/atak. */
  speed?: number;
  defending: boolean;
  /** zostaje dla bossów / wstecznej zgodności (mikstury z hardcodowanego limitu) */
  potionsLeft: number;
  /** consumables snapshot z inventory na czas walki (mutowalny — decremented przy applyItem) */
  consumables?: Record<string, number>;
  /** immutable startowy snapshot — do diffowania zużytego po walce */
  consumablesStart?: Record<string, number>;
  /** dostępne skille (id-ki z SKILLS rejestru) */
  skills?: string[];
  /** ile tur cooldownu zostało dla danego skilla */
  skillCooldowns?: Record<string, number>;
  /** aktywne buffy / debuffy (DoT, HoT, shield, taunt, slow, def_amp, dmg_amp) */
  buffs?: import('./buffs.js').Buff[];
  /** spell power — derive: primary.int * 2; cached snapshot z player-stats / mob */
  spellPower?: number;
  /** Snapshot primary stats (STR/AGI/WIT/INT) — używane przez skill scaling. */
  primary?: PrimaryStats;
  /** flavor lines używane jako nazwa ataku (zamiast globalnego ATTACK_NAMES) */
  attackLines?: string[];
  /**
   * Snapshot effects gemów wstawionych w broń. Każdy element listy = jeden gem
   * (per-gem niezależny proc roll → 4 fire smalls = 4×4% = ~16% burn). Bonus
   * dmg sumuje się i dolatuje do każdego attaku (przed redukcją obrony).
   */
  weaponGems?: WeaponGemEffect[];
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyLifesteal(attacker: Combatant, dmgDealt: number): string {
  const pct = getLifestealPercent(attacker);
  if (pct <= 0 || dmgDealt <= 0) return '';
  const heal = Math.floor((dmgDealt * pct) / 100);
  if (heal <= 0) return '';
  const before = attacker.hp;
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
  const restored = attacker.hp - before;
  return restored > 0 ? ` 🩸 (+${restored} HP lifesteal)` : '';
}

/** Suma bonus dmg ze wszystkich gemów w broni (każdy gem dorzuca flat dmg per hit). */
function sumGemBonusDmg(c: Combatant): number {
  if (!c.weaponGems || c.weaponGems.length === 0) return 0;
  return c.weaponGems.reduce((s, g) => s + g.bonusDmg, 0);
}

/**
 * Roluje proc każdego gemu osobno. Tick (DoT amount / slow speed reduction)
 * skalowany liczbą gemów tego elementu na broni — 4 fire gemy → burn 4×4
 * = 16 dmg/tick (ttl bez zmian, nadal 3 rundy). Jeśli proc się sumuje, to
 * też dmg z wszystkich gemów ma się sumować.
 */
function applyGemProcs(attacker: Combatant, defender: Combatant): string {
  if (!attacker.weaponGems || attacker.weaponGems.length === 0) return '';
  // Single-pass: build counts/sample + roll proc razem.
  const counts: Partial<Record<GemElement, number>> = {};
  const sample: Partial<Record<GemElement, WeaponGemEffect>> = {};
  const procced: Partial<Record<GemElement, boolean>> = {};
  for (const g of attacker.weaponGems) {
    counts[g.element] = (counts[g.element] ?? 0) + 1;
    sample[g.element] = g;
    if (Math.random() < g.procChance) procced[g.element] = true;
  }
  const lines: string[] = [];
  for (const element of ['fire', 'ice', 'poison'] as const) {
    if (!procced[element]) continue;
    const s = sample[element];
    const count = counts[element];
    if (!s || !count) continue;
    const stackedAmount = s.buff.amount * count;
    addBuff(defender, {
      id: s.buff.id,
      kind: s.buff.kind,
      source: count > 1 ? `${s.buff.source} ×${count}` : s.buff.source,
      ttl: s.buff.ttl,
      amount: stackedAmount,
    });
    if (element === 'fire') lines.push(`🔥 **${defender.name}** zostaje podpalony (${stackedAmount}/tick)!`);
    else if (element === 'ice') lines.push(`❄️ **${defender.name}** zostaje spowolniony (-${stackedAmount} spd)!`);
    else lines.push(`🧪 **${defender.name}** zostaje zatruty (${stackedAmount}/tick)!`);
  }
  if (lines.length === 0) return '';
  return ' ' + lines.join(' ');
}

export function applyAttack(attacker: Combatant, defender: Combatant): string {
  const attackName = pick(attacker.attackLines ?? ATTACK_NAMES);
  const dodgeChance = DODGE_CHANCE + getEvasionPercent(defender) / 100;
  if (Math.random() < dodgeChance) {
    return `**${attacker.name}** ładuje **${attackName}**, ale **${defender.name}** odpala **${pick(DODGE_NAMES)}** i unika!`;
  }
  const gemBonus = sumGemBonusDmg(attacker);
  let baseDmg =
    10 +
    Math.floor(Math.random() * 21) +
    attacker.damageBonus +
    getDamageAmp(attacker) +
    gemBonus;
  const totalDef = (defender.defenseBonus ?? 0) + getDefenseAmp(defender);
  if (totalDef > 0) {
    baseDmg = Math.max(1, baseDmg - totalDef);
  }
  const critChance = CRIT_CHANCE + (attacker.critBonus ?? 0) + getCritAmp(attacker) / 100;
  const crit = Math.random() < critChance;
  let dmg = crit ? baseDmg * CRIT_MULTIPLIER : baseDmg;
  const critTag = crit ? ' 💥 **KRYT!**' : '';

  if (defender.defending) {
    if (Math.random() < BLOCK_CHANCE) {
      return `🛡️ **${attacker.name}** odpala **${attackName}**${critTag} za **${dmg}** dmg, ale **${defender.name}** całkowicie blokuje cios!`;
    }
    const shield = consumeShield(defender, dmg);
    dmg = shield.remaining;
    defender.hp = Math.max(0, defender.hp - dmg);
    const lifestealNote = applyLifesteal(attacker, dmg);
    const shieldNote = shield.absorbed > 0 ? ` (tarcza pochłonęła ${shield.absorbed})` : '';
    const procNote = dmg > 0 ? applyGemProcs(attacker, defender) : '';
    return `⚔️ **${attacker.name}** przebija **${attackName}** przez gardę **${defender.name}** i robi **${dmg}** dmg${critTag}${shieldNote}${lifestealNote} (obrona nieskuteczna).${procNote}`;
  }
  const shieldOpen = consumeShield(defender, dmg);
  dmg = shieldOpen.remaining;
  defender.hp = Math.max(0, defender.hp - dmg);
  const lifestealNote = applyLifesteal(attacker, dmg);
  const shieldOpenNote =
    shieldOpen.absorbed > 0 ? ` (tarcza pochłonęła ${shieldOpen.absorbed})` : '';
  const procNote = dmg > 0 ? applyGemProcs(attacker, defender) : '';
  return `⚔️ **${attacker.name}** odpala **${attackName}** i robi **${dmg}** dmg.${critTag}${shieldOpenNote}${lifestealNote}${procNote}`;
}

export function applyDefend(p: Combatant): string {
  p.defending = true;
  return `🛡️ **${p.name}** przyjmuje pozycję **${pick(DEFEND_NAMES)}**.`;
}

function totalPotions(p: Combatant): number {
  return p.potionsLeft + (p.consumables?.potion_small ?? 0);
}

/**
 * Wypicie potki w walce — zużywa najpierw `potionsLeft` (2 darmowe na walkę),
 * potem `consumables.potion_small` (z plecaka). UI łączy oba pule w jednym
 * buttonie więc gracz nie musi rozróżniać źródła.
 */
function consumePotion(p: Combatant): string {
  let source: string;
  if (p.potionsLeft > 0) {
    p.potionsLeft -= 1;
    source = 'darmowa na walkę';
  } else {
    if (!p.consumables) p.consumables = {};
    const have = p.consumables.potion_small ?? 0;
    if (have <= 0) {
      return `🧪 **${p.name}** sięga po miksturę, ale flaszka pusta.`;
    }
    p.consumables.potion_small = have - 1;
    source = 'z plecaka';
  }
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + POTION_HEAL);
  const restored = p.hp - before;
  return `🧪 **${p.name}** chla **${pick(POTION_NAMES)}** (${source}) i odzyskuje **${restored}** HP (zostało ${totalPotions(p)}).`;
}

/** Backward-compat: stary entry-point bez itemId — alias do `consumePotion`. */
export function applyPotion(p: Combatant): string {
  return consumePotion(p);
}

export function applyItem(p: Combatant, itemId: string): string {
  if (itemId === 'potion_small') return consumePotion(p);
  if (itemId === 'potion_greater') return consumeGreaterPotion(p);
  if (!p.consumables) p.consumables = {};
  const have = p.consumables[itemId] ?? 0;
  if (have <= 0) return `🎒 **${p.name}** sięga po item \`${itemId}\`, ale plecak pusty.`;
  p.consumables[itemId] = have - 1;
  return `🎒 **${p.name}** używa \`${itemId}\` (efekt nieznany).`;
}

/**
 * Wielka mikstura — mocniejszy wariant, leczy 60 HP. Tylko z plecaka
 * (nie ma "darmowych na walkę"). Drop tylko z dungeonów.
 */
function consumeGreaterPotion(p: Combatant): string {
  if (!p.consumables) p.consumables = {};
  const have = p.consumables.potion_greater ?? 0;
  if (have <= 0) {
    return `🧪 **${p.name}** sięga po wielką miksturę, ale flaszka pusta.`;
  }
  p.consumables.potion_greater = have - 1;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + GREATER_POTION_HEAL);
  const restored = p.hp - before;
  return `🧪💎 **${p.name}** chla **Wielką Miksturę** i odzyskuje **${restored}** HP.`;
}

export interface RoundResult {
  lines: string[];
  finished: boolean;
  winner?: Combatant;
  loser?: Combatant;
  draw: boolean;
}

// Multi-combatant resolve — używany przez BattleEngine (boss/dungeon/ambush/party).
// Importowany przez `engine/combat-battle.ts` żeby uniknąć cyklu importów.
function normalize(a: CombatAction | BattleAction): BattleAction {
  if (typeof a === 'string') {
    if (a === 'potion') return { kind: 'item', itemId: 'potion_small' };
    return { kind: a };
  }
  return a;
}

export function resolveRound(
  p1: Combatant,
  p2: Combatant,
  a1: CombatAction | BattleAction,
  a2: CombatAction | BattleAction,
): RoundResult {
  const action1 = normalize(a1);
  const action2 = normalize(a2);
  const lines: string[] = [];

  p1.defending = action1.kind === 'defend';
  p2.defending = action2.kind === 'defend';
  if (action1.kind === 'defend') lines.push(applyDefend(p1));
  if (action2.kind === 'defend') lines.push(applyDefend(p2));
  if (action1.kind === 'item') {
    if (action1.itemId) lines.push(applyItem(p1, action1.itemId));
    else lines.push(applyPotion(p1));
  }
  if (action2.kind === 'item') {
    if (action2.itemId) lines.push(applyItem(p2, action2.itemId));
    else lines.push(applyPotion(p2));
  }
  if (action1.kind === 'attack') lines.push(applyAttack(p1, p2));
  if (action2.kind === 'attack') lines.push(applyAttack(p2, p1));
  p1.defending = false;
  p2.defending = false;

  const dead1 = p1.hp <= 0;
  const dead2 = p2.hp <= 0;
  if (dead1 && dead2) {
    return { lines, finished: true, draw: true };
  }
  if (dead1 || dead2) {
    return {
      lines,
      finished: true,
      draw: false,
      winner: dead1 ? p2 : p1,
      loser: dead1 ? p1 : p2,
    };
  }
  return { lines, finished: false, draw: false };
}
