import fs from 'node:fs';
import path from 'node:path';
import type { ItemInstance, ItemSlot } from './items.js';

export type SkillName = 'mining' | 'fishing' | 'woodcutting' | 'crafting' | 'combat';

export type AttributeName = 'attack' | 'defense' | 'hp' | 'crit';
export type PrimaryAttribute = 'str' | 'agi' | 'wit' | 'int';

export interface PrimaryStats {
  str: number;
  agi: number;
  wit: number;
  int: number;
}

export interface SkillRecord {
  level: number;
  xp: number;
}

export interface PlayerAttributes {
  attack: number;
  defense: number;
  hp: number;
  crit: number;
}

export interface ActiveExpedition {
  destination: string;
  endsAt: number;
  channelId?: string;
  partyId?: string;
}

export interface Inventory {
  resources: Record<string, number>;
  items: ItemInstance[];
}

export interface PlayerStats {
  id: string;
  name: string;
  xp: number;
  level: number;
  gold: number;
  wins: number;
  losses: number;
  duels: number;
  inventory: Inventory;
  equipped: { weapon?: string; armor?: string; tool?: string };
  skills: Record<SkillName, SkillRecord>;
  unspentPoints: number;
  attribute: PlayerAttributes;
  primary: PrimaryStats;
  raceId?: string;
  classId?: string;
  subclassId?: string;
  subclass2Id?: string;
  activeExpedition?: ActiveExpedition | null;
  cooldowns: Record<string, number>;
}

const SKILL_NAMES: SkillName[] = ['mining', 'fishing', 'woodcutting', 'crafting', 'combat'];

function defaultPlayer(id: string, name: string): PlayerStats {
  return {
    id,
    name,
    xp: 0,
    level: 1,
    gold: 100,
    wins: 0,
    losses: 0,
    duels: 0,
    inventory: { resources: {}, items: [] },
    equipped: {},
    skills: SKILL_NAMES.reduce(
      (acc, k) => {
        acc[k] = { level: 1, xp: 0 };
        return acc;
      },
      {} as Record<SkillName, SkillRecord>,
    ),
    unspentPoints: 0,
    attribute: { attack: 0, defense: 0, hp: 0, crit: 0 },
    primary: { str: 0, agi: 0, wit: 0, int: 0 },
    activeExpedition: null,
    cooldowns: {},
  };
}

function ensureDefaults(p: any, id: string, name: string): PlayerStats {
  const base = defaultPlayer(id, name);
  const merged: PlayerStats = {
    ...base,
    ...p,
    inventory: {
      resources: p?.inventory?.resources ?? {},
      items: p?.inventory?.items ?? [],
    },
    equipped: p?.equipped ?? {},
    skills: SKILL_NAMES.reduce(
      (acc, k) => {
        acc[k] = p?.skills?.[k] ?? { level: 1, xp: 0 };
        return acc;
      },
      {} as Record<SkillName, SkillRecord>,
    ),
    attribute: {
      attack: p?.attribute?.attack ?? 0,
      defense: p?.attribute?.defense ?? 0,
      hp: p?.attribute?.hp ?? 0,
      crit: p?.attribute?.crit ?? 0,
    },
    primary: {
      str: p?.primary?.str ?? 0,
      agi: p?.primary?.agi ?? 0,
      wit: p?.primary?.wit ?? 0,
      int: p?.primary?.int ?? 0,
    },
    gold: p?.gold ?? 100,
    raceId: p?.raceId,
    classId: p?.classId,
    subclassId: p?.subclassId,
    subclass2Id: p?.subclass2Id,
    unspentPoints: p?.unspentPoints ?? 0,
    activeExpedition: p?.activeExpedition ?? null,
    cooldowns: p?.cooldowns ?? {},
  };
  merged.name = name || p?.name || id;
  merged.id = id;
  return merged;
}

export class PlayerStatsService {
  private readonly file: string;
  private readonly stats: Map<string, PlayerStats> = new Map();

  constructor(file = path.resolve('data/players.json')) {
    this.file = file;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const arr = JSON.parse(raw) as any[];
      for (const s of arr) {
        if (!s?.id) continue;
        this.stats.set(s.id, ensureDefaults(s, s.id, s.name ?? s.id));
      }
    } catch {
      // missing/invalid file is fine
    }
  }

  save(): void {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.stats.values()], null, 2), 'utf8');
  }

  get(id: string, name?: string): PlayerStats {
    let s = this.stats.get(id);
    if (!s) {
      s = defaultPlayer(id, name ?? id);
      this.stats.set(id, s);
    } else if (name) {
      s.name = name;
    }
    return s;
  }

  list(): PlayerStats[] {
    return [...this.stats.values()];
  }

  // ── XP / leveling ─────────────────────────────────
  xpForNextLevel(level: number): number {
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  xpToNext(p: PlayerStats): number {
    return this.xpForNextLevel(p.level) - p.xp;
  }

  private applyLevelUp(p: PlayerStats): boolean {
    let leveled = false;
    while (p.xp >= this.xpForNextLevel(p.level)) {
      p.xp -= this.xpForNextLevel(p.level);
      p.level += 1;
      p.unspentPoints += 1;
      leveled = true;
    }
    return leveled;
  }

  addXp(p: PlayerStats, amount: number): boolean {
    p.xp += amount;
    return this.applyLevelUp(p);
  }

  addSkillXp(p: PlayerStats, skill: SkillName, amount: number): boolean {
    const s = p.skills[skill];
    s.xp += amount;
    let leveled = false;
    while (s.xp >= this.xpForNextLevel(s.level)) {
      s.xp -= this.xpForNextLevel(s.level);
      s.level += 1;
      leveled = true;
    }
    return leveled;
  }

  // ── HP/dmg z atrybutów + skilla combat + primary ────
  hpFor(p: PlayerStats): number {
    return (
      100 +
      (p.skills.combat.level - 1) * 10 +
      p.attribute.hp * 5 +
      p.primary.str * 5 +
      p.primary.wit * 3
    );
  }

  damageBonus(p: PlayerStats): number {
    return (p.skills.combat.level - 1) * 2 + p.attribute.attack + p.primary.str;
  }

  defenseBonus(p: PlayerStats): number {
    return p.attribute.defense + p.primary.wit;
  }

  critBonus(p: PlayerStats): number {
    return p.attribute.crit + p.primary.agi * 0.5;
  }

  spellPower(p: PlayerStats): number {
    return p.primary.int * 2;
  }

  // ── PvP outcome ────────────────────────────────────
  awardWin(
    winnerId: string,
    winnerName: string,
    loserId: string,
    loserName: string,
  ): { winner: PlayerStats; loser: PlayerStats; winnerLeveledUp: boolean } {
    const winner = this.get(winnerId, winnerName);
    const loser = this.get(loserId, loserName);
    winner.wins += 1;
    winner.duels += 1;
    const gainedXp = 50 + Math.max(0, loser.level - winner.level) * 10;
    winner.xp += gainedXp;
    this.addSkillXp(winner, 'combat', gainedXp);
    loser.losses += 1;
    loser.duels += 1;
    loser.xp += 10;
    this.addSkillXp(loser, 'combat', 10);
    const winnerLeveledUp = this.applyLevelUp(winner);
    this.applyLevelUp(loser);
    this.save();
    return { winner, loser, winnerLeveledUp };
  }

  awardPartyWin(
    winners: { id: string; name: string }[],
    losers: { id: string; name: string }[],
  ): {
    winners: { stats: PlayerStats; leveledUp: boolean; gainedXp: number }[];
    losers: { stats: PlayerStats; gainedXp: number }[];
  } {
    const winnerStats = winners.map((w) => this.get(w.id, w.name));
    const loserStats = losers.map((l) => this.get(l.id, l.name));
    const avgLoserLvl = loserStats.length
      ? loserStats.reduce((s, l) => s + l.level, 0) / loserStats.length
      : 0;

    const winnerResults = winnerStats.map((w) => {
      w.wins += 1;
      w.duels += 1;
      const gainedXp = 50 + Math.max(0, Math.round(avgLoserLvl - w.level)) * 10;
      w.xp += gainedXp;
      this.addSkillXp(w, 'combat', gainedXp);
      const leveledUp = this.applyLevelUp(w);
      return { stats: w, leveledUp, gainedXp };
    });
    const loserResults = loserStats.map((l) => {
      l.losses += 1;
      l.duels += 1;
      const gainedXp = 10;
      l.xp += gainedXp;
      this.addSkillXp(l, 'combat', gainedXp);
      this.applyLevelUp(l);
      return { stats: l, gainedXp };
    });
    this.save();
    return { winners: winnerResults, losers: loserResults };
  }

  // ── Gold ───────────────────────────────────────────
  addGold(p: PlayerStats, amount: number): void {
    p.gold = Math.max(0, p.gold + amount);
  }

  removeGold(p: PlayerStats, amount: number): boolean {
    if (p.gold < amount) return false;
    p.gold -= amount;
    return true;
  }

  hasGold(p: PlayerStats, amount: number): boolean {
    return p.gold >= amount;
  }

  // ── Inventory ──────────────────────────────────────
  addResource(p: PlayerStats, itemId: string, qty: number): void {
    p.inventory.resources[itemId] = (p.inventory.resources[itemId] ?? 0) + qty;
    if (p.inventory.resources[itemId] <= 0) delete p.inventory.resources[itemId];
  }

  removeResource(p: PlayerStats, itemId: string, qty: number): boolean {
    const have = p.inventory.resources[itemId] ?? 0;
    if (have < qty) return false;
    p.inventory.resources[itemId] = have - qty;
    if (p.inventory.resources[itemId] <= 0) delete p.inventory.resources[itemId];
    return true;
  }

  hasResource(p: PlayerStats, itemId: string, qty: number): boolean {
    return (p.inventory.resources[itemId] ?? 0) >= qty;
  }

  addItem(p: PlayerStats, item: ItemInstance): void {
    p.inventory.items.push(item);
  }

  removeItem(p: PlayerStats, uid: string): ItemInstance | null {
    const i = p.inventory.items.findIndex((it) => it.uid === uid);
    if (i < 0) return null;
    return p.inventory.items.splice(i, 1)[0];
  }

  findItem(p: PlayerStats, uid: string): ItemInstance | undefined {
    return p.inventory.items.find((it) => it.uid === uid);
  }

  // ── Equipment ──────────────────────────────────────
  equip(p: PlayerStats, uid: string): { ok: boolean; reason?: string; item?: ItemInstance } {
    const item = this.findItem(p, uid);
    if (!item || !item.slot)
      return {
        ok: false,
        reason: 'Nie posiadasz takiego itemu lub nie da się go założyć.',
      };
    p.equipped[item.slot] = uid;
    return { ok: true, item };
  }

  unequip(p: PlayerStats, slot: ItemSlot): ItemInstance | null {
    const uid = p.equipped[slot];
    if (!uid) return null;
    const item = this.findItem(p, uid);
    delete p.equipped[slot];
    return item ?? null;
  }

  equippedItem(p: PlayerStats, slot: ItemSlot): ItemInstance | undefined {
    const uid = p.equipped[slot];
    if (!uid) return undefined;
    return this.findItem(p, uid);
  }

  // ── Cooldowns ──────────────────────────────────────
  remainingCooldown(p: PlayerStats, key: string): number {
    const t = p.cooldowns[key];
    if (!t) return 0;
    const left = t - Date.now();
    return left > 0 ? left : 0;
  }

  setCooldown(p: PlayerStats, key: string, ms: number): void {
    p.cooldowns[key] = Date.now() + ms;
  }

  // ── Primary attribute spending (STR/AGI/WIT/INT) ───
  spendPrimary(
    p: PlayerStats,
    attr: PrimaryAttribute,
    points: number,
  ): { ok: boolean; reason?: string } {
    if (points <= 0) return { ok: false, reason: 'Liczba punktów musi być dodatnia.' };
    if (p.unspentPoints < points)
      return { ok: false, reason: `Masz tylko ${p.unspentPoints} punktów.` };
    p.unspentPoints -= points;
    p.primary[attr] += points;
    return { ok: true };
  }

  // legacy: bezpośrednia modyfikacja secondary attribute (np. z itemów)
  spendPoints(
    p: PlayerStats,
    attr: AttributeName,
    points: number,
  ): { ok: boolean; reason?: string } {
    if (points <= 0) return { ok: false, reason: 'Liczba punktów musi być dodatnia.' };
    if (p.unspentPoints < points)
      return { ok: false, reason: `Masz tylko ${p.unspentPoints} punktów.` };
    p.unspentPoints -= points;
    p.attribute[attr] += points;
    return { ok: true };
  }

  // ── Race ───────────────────────────────────────────
  applyRace(
    p: PlayerStats,
    raceId: string,
    startingStats: PrimaryStats,
  ): { ok: boolean; reason?: string } {
    if (p.raceId)
      return {
        ok: false,
        reason: `Masz już rasę: ${p.raceId}. Wybór jest dożywotni.`,
      };
    p.raceId = raceId;
    this.addPrimary(p, startingStats);
    return { ok: true };
  }

  // ── Class / subclass ───────────────────────────────
  applyClass(
    p: PlayerStats,
    classId: string,
    primaryBonus: PrimaryStats,
  ): { ok: boolean; reason?: string } {
    if (p.classId)
      return {
        ok: false,
        reason: `Masz już klasę: ${p.classId}. Wybór jest dożywotni.`,
      };
    p.classId = classId;
    this.addPrimary(p, primaryBonus);
    return { ok: true };
  }

  applySubclass(
    p: PlayerStats,
    parentClassId: string,
    subclassId: string,
    primaryBonus: PrimaryStats,
    requiredCombatLevel: number,
  ): { ok: boolean; reason?: string } {
    if (!p.classId)
      return {
        ok: false,
        reason: 'Najpierw wybierz klasę przez `.class pick <id>`.',
      };
    if (p.classId !== parentClassId)
      return {
        ok: false,
        reason: `Ta subklasa nie pasuje do twojej klasy (${p.classId}).`,
      };
    if (p.subclassId) return { ok: false, reason: `Masz już subklasę: ${p.subclassId}.` };
    if (p.skills.combat.level < requiredCombatLevel)
      return {
        ok: false,
        reason: `Wymagany combat lvl ${requiredCombatLevel} (masz ${p.skills.combat.level}).`,
      };
    p.subclassId = subclassId;
    this.addPrimary(p, primaryBonus);
    return { ok: true };
  }

  applySubclass2(
    p: PlayerStats,
    parentSubId: string,
    sub2Id: string,
    primaryBonus: PrimaryStats,
    requiredCombatLevel: number,
  ): { ok: boolean; reason?: string } {
    if (!p.classId || !p.subclassId)
      return {
        ok: false,
        reason: 'Najpierw wybierz klasę i subklasę (`.class pick`/`.class subclass`).',
      };
    if (p.subclassId !== parentSubId)
      return {
        ok: false,
        reason: `Ta tier-2 subklasa nie pasuje do twojej subklasy (${p.subclassId}).`,
      };
    if (p.subclass2Id) return { ok: false, reason: `Masz już tier-2 subklasę: ${p.subclass2Id}.` };
    if (p.skills.combat.level < requiredCombatLevel)
      return {
        ok: false,
        reason: `Wymagany combat lvl ${requiredCombatLevel} (masz ${p.skills.combat.level}).`,
      };
    p.subclass2Id = sub2Id;
    this.addPrimary(p, primaryBonus);
    return { ok: true };
  }

  private addPrimary(p: PlayerStats, bonus: PrimaryStats): void {
    p.primary.str += bonus.str;
    p.primary.agi += bonus.agi;
    p.primary.wit += bonus.wit;
    p.primary.int += bonus.int;
  }

  private unapplyPrimary(p: PlayerStats, bonus: PrimaryStats): void {
    p.primary.str -= bonus.str;
    p.primary.agi -= bonus.agi;
    p.primary.wit -= bonus.wit;
    p.primary.int -= bonus.int;
  }

  resetRace(p: PlayerStats, raceStartingStats: PrimaryStats): void {
    this.unapplyPrimary(p, raceStartingStats);
    p.raceId = undefined;
  }

  resetClass(
    p: PlayerStats,
    classBonus: PrimaryStats,
    subclassBonus?: PrimaryStats,
    subclass2Bonus?: PrimaryStats,
  ): void {
    this.unapplyPrimary(p, classBonus);
    if (subclassBonus) this.unapplyPrimary(p, subclassBonus);
    if (subclass2Bonus) this.unapplyPrimary(p, subclass2Bonus);
    p.classId = undefined;
    p.subclassId = undefined;
    p.subclass2Id = undefined;
  }
}
