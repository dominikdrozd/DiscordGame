import type { ItemInstance, ItemSlot, ToolKind } from './items.js';
import { appliedItemStats, itemRequiredLevel } from './items.js';
import { gemArmorEffect, gemToolEffect } from './gem-effects.js';
import { CLASSES } from '../classes/index.js';
import type { Repos } from '../../../persistence/repos/index.js';

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
  /**
   * Timestamp gdy zaczął się aktywny ambush. Dopóki ustawione,
   * `runClaim` blokuje odbiór nagrody i czas pozostały do końca wyprawy
   * jest "zamrożony" — `endsAt` nie zmienia się aż do zakończenia walki.
   * Po finishu/timeoucie ambushu, jeśli wyprawa kontynuowana,
   * `endsAt += (now - ambushedSince)` żeby wydłużyć czas o trwanie walki.
   */
  ambushedSince?: number;
  /**
   * Forced final encounter na koniec ekspedycji — gracz musi pokonać moba
   * z tierem ekspedycji ZANIM odbierze loot. Flag `true` po wygranej tej
   * walki — oznacza że claim może faktycznie awardować rewardy.
   * Przy pierwszym `claim` po endsAt: triggeruje walkę, set false → true
   * po wygranej. Loss klieruje `activeExpedition = null`.
   */
  finalFightDone?: boolean;
}

export interface Inventory {
  resources: Record<string, number>;
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
  /**
   * Wyuczone skille bojowe — wczytywane do `Combatant.skills` w walce.
   * Auto-fill: startingSkills przy `applyClass`, bonusSkills przy
   * `applySubclass`/`applySubclass2`. Reszta przez `learnSkill` (gold + reqs).
   */
  learnedSkills: string[];
  /**
   * Księgi super-spelli zdobyte z dropów bossów ale jeszcze nie wyuczone.
   * Gracz musi spełnić requirements (lvl + primary) żeby z nich skorzystać.
   * Konsumowane przez `/skills learn <id>`.
   */
  unlearnedBooks: string[];
  /**
   * Stan questów. Quest **tylko raz** wzięty (started = jest w którejkolwiek
   * z 3 list). Po zakończeniu / abandonie nie da się ponownie.
   */
  quests: {
    /** Aktualnie aktywne — można robić progress. */
    active: string[];
    /** Zakończone (turn-in u NPC). */
    completed: string[];
    /** Porzucone — gracz wycofał się przed dokończeniem. */
    abandoned: string[];
    /**
     * Per-quest metadata zapisywana przy completionie — używane np. w
     * dialogach żeby pokazać różne komentarze ("wygrałeś" / "przegrałeś").
     */
    meta?: Record<string, { wonDuel?: boolean }>;
  };
  activeExpedition?: ActiveExpedition | null;
  cooldowns: Record<string, number>;
}

function makeSkillsRecord(read: (k: SkillName) => SkillRecord): Record<SkillName, SkillRecord> {
  return {
    mining: read('mining'),
    fishing: read('fishing'),
    woodcutting: read('woodcutting'),
    crafting: read('crafting'),
    combat: read('combat'),
  };
}

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
    inventory: { resources: {} },
    equipped: {},
    skills: makeSkillsRecord(() => ({ level: 1, xp: 0 })),
    unspentPoints: 0,
    attribute: { attack: 0, defense: 0, hp: 0, crit: 0 },
    primary: { str: 0, agi: 0, wit: 0, int: 0 },
    learnedSkills: [],
    unlearnedBooks: [],
    quests: { active: [], completed: [], abandoned: [], meta: {} },
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
    },
    equipped: p?.equipped ?? {},
    skills: makeSkillsRecord((k) => p?.skills?.[k] ?? { level: 1, xp: 0 }),
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
    learnedSkills: Array.isArray(p?.learnedSkills) ? [...p.learnedSkills] : [],
    unlearnedBooks: Array.isArray(p?.unlearnedBooks) ? [...p.unlearnedBooks] : [],
    quests: {
      active: Array.isArray(p?.quests?.active) ? [...p.quests.active] : [],
      completed: Array.isArray(p?.quests?.completed) ? [...p.quests.completed] : [],
      abandoned: Array.isArray(p?.quests?.abandoned) ? [...p.quests.abandoned] : [],
      meta:
        typeof p?.quests?.meta === 'object' && p?.quests?.meta ? { ...p.quests.meta } : {},
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
  /** In-RAM SoT — populowane przez `load()` z Mongo, mutowane przez serwisy. */
  private readonly byId = new Map<string, PlayerStats>();
  /** Wszystkie itemy w pamięci, key = uid. */
  private readonly itemsByUid = new Map<string, ItemInstance>();
  /** Index userId → Set<uid> dla szybkiego inventory lookup. */
  private readonly itemsByUser = new Map<string, Set<string>>();

  /** Dirty tracking — porównanie JSON.stringify, write tylko gdy różne. */
  private readonly lastSavedPlayerJson = new Map<string, string>();
  private readonly lastSavedItemJson = new Map<string, string>();
  /** Item uidy do usunięcia z Mongo przy najbliższym save(). */
  private readonly itemsToDelete = new Set<string>();

  /** Async writes queued po save() — flush() czeka na całość (SIGTERM). */
  private pendingWrites: Promise<unknown>[] = [];

  constructor(private readonly repos: Repos) {}

  /** Wczytuje całość gracze + ich itemy z Mongo. Wywołać raz na starcie. */
  async load(): Promise<void> {
    this.byId.clear();
    this.itemsByUid.clear();
    this.itemsByUser.clear();
    this.lastSavedPlayerJson.clear();
    this.lastSavedItemJson.clear();

    const players = await this.repos.player.findAll();
    for (const doc of players) {
      const { _id, ...rest } = doc;
      const stats = ensureDefaults(rest, _id, doc.name);
      this.byId.set(_id, stats);
      this.lastSavedPlayerJson.set(_id, JSON.stringify(stats));
      this.itemsByUser.set(_id, new Set());
    }

    const allItems = await this.repos.item.findAll();
    for (const doc of allItems) {
      const { _id, userId, ...itemRest } = doc;
      const item = itemRest as ItemInstance;
      this.itemsByUid.set(item.uid, item);
      this.lastSavedItemJson.set(item.uid, JSON.stringify(item));
      let set = this.itemsByUser.get(userId);
      if (!set) {
        set = new Set();
        this.itemsByUser.set(userId, set);
      }
      set.add(item.uid);
    }
  }

  /**
   * Sync z perspektywy callera, fire-and-forget async upsert do Mongo
   * z dirty trackingiem. `flush()` w SIGTERM czeka na pending writes.
   */
  save(): void {
    // Players
    for (const [id, p] of this.byId) {
      const json = JSON.stringify(p);
      if (this.lastSavedPlayerJson.get(id) === json) continue;
      this.lastSavedPlayerJson.set(id, json);
      const doc = { ...p, _id: id };
      this.pendingWrites.push(
        this.repos.player.upsert(doc).catch((e: unknown) => {
          console.error(
            `[mongo] player save fail ${id}:`,
            e instanceof Error ? e.message : String(e),
          );
        }),
      );
    }
    // Items
    for (const [uid, item] of this.itemsByUid) {
      const json = JSON.stringify(item);
      if (this.lastSavedItemJson.get(uid) === json) continue;
      this.lastSavedItemJson.set(uid, json);
      const userId = this.findUserIdForItem(uid);
      if (!userId) continue; // sierota — pomiń
      const doc = { ...item, _id: uid, userId };
      this.pendingWrites.push(
        this.repos.item.upsert(doc).catch((e: unknown) => {
          console.error(
            `[mongo] item save fail ${uid}:`,
            e instanceof Error ? e.message : String(e),
          );
        }),
      );
    }
    // Items to delete
    for (const uid of this.itemsToDelete) {
      this.lastSavedItemJson.delete(uid);
      this.pendingWrites.push(
        this.repos.item.deleteOne(uid).catch((e: unknown) => {
          console.error(
            `[mongo] item delete fail ${uid}:`,
            e instanceof Error ? e.message : String(e),
          );
        }),
      );
    }
    this.itemsToDelete.clear();
  }

  /** Czeka na zakończenie wszystkich pending writes — używać w SIGTERM. */
  async flush(): Promise<void> {
    const queue = this.pendingWrites;
    this.pendingWrites = [];
    await Promise.allSettled(queue);
  }

  private findUserIdForItem(uid: string): string | undefined {
    for (const [userId, set] of this.itemsByUser) {
      if (set.has(uid)) return userId;
    }
    return undefined;
  }

  get(id: string, name?: string): PlayerStats {
    let s = this.byId.get(id);
    if (!s) {
      s = defaultPlayer(id, name ?? id);
      this.byId.set(id, s);
      this.itemsByUser.set(id, new Set());
    } else if (name) {
      s.name = name;
    }
    return s;
  }

  list(): PlayerStats[] {
    return [...this.byId.values()];
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

  /**
   * Łączny primary stat (str/agi/wit/int) — base z PlayerStats + sumy z
   * założonego (i ZIDENTYFIKOWANEGO) ekwipunku + gemy w narzędziu (fire→STR,
   * ice→AGI, poison→INT). SoT dla wszystkich formuł effective.
   */
  effectivePrimary(p: PlayerStats): PrimaryStats {
    const out: PrimaryStats = {
      str: p.primary.str,
      agi: p.primary.agi,
      wit: p.primary.wit,
      int: p.primary.int,
    };
    for (const slot of ['weapon', 'armor', 'tool'] as const) {
      const it = this.equippedItem(p, slot);
      if (!it || it.identified === false) continue;
      const ip = it.primary;
      if (!ip) continue;
      if (ip.str) out.str += ip.str;
      if (ip.agi) out.agi += ip.agi;
      if (ip.wit) out.wit += ip.wit;
      if (ip.int) out.int += ip.int;
    }
    // Tool gems → primary stats (fire/red→STR, ice/blue→AGI, poison/green→INT).
    const tool = this.equippedItem(p, 'tool');
    if (tool && tool.identified !== false && tool.gems) {
      for (const id of tool.gems) {
        if (!id) continue;
        const eff = gemToolEffect(id);
        if (eff) out[eff.primary] += eff.amount;
      }
    }
    return out;
  }

  /** Suma `prop` z efektów armor gemów. Zwraca 0 gdy brak pancerza/gemów. */
  private sumArmorGem(p: PlayerStats, prop: 'hp' | 'defense' | 'hotAmount'): number {
    const a = this.equippedItem(p, 'armor');
    if (!a || a.identified === false || !a.gems) return 0;
    let total = 0;
    for (const id of a.gems) {
      if (!id) continue;
      const eff = gemArmorEffect(id);
      const v = eff?.[prop];
      if (v) total += v;
    }
    return total;
  }

  armorGemHpBonus(p: PlayerStats): number {
    return this.sumArmorGem(p, 'hp');
  }

  armorGemDefenseBonus(p: PlayerStats): number {
    return this.sumArmorGem(p, 'defense');
  }

  armorGemHotAmount(p: PlayerStats): number {
    return this.sumArmorGem(p, 'hotAmount');
  }

  hpFor(p: PlayerStats): number {
    const pr = this.effectivePrimary(p);
    return (
      100 +
      (p.skills.combat.level - 1) * 10 +
      p.attribute.hp * 5 +
      pr.str * 5 +
      pr.wit * 3
    );
  }

  damageBonus(p: PlayerStats): number {
    const pr = this.effectivePrimary(p);
    return (p.skills.combat.level - 1) * 2 + p.attribute.attack + pr.str;
  }

  defenseBonus(p: PlayerStats): number {
    const pr = this.effectivePrimary(p);
    return p.attribute.defense + pr.wit;
  }

  critBonus(p: PlayerStats): number {
    const pr = this.effectivePrimary(p);
    return p.attribute.crit + pr.agi * 0.5;
  }

  spellPower(p: PlayerStats): number {
    const pr = this.effectivePrimary(p);
    return pr.int * 2;
  }

  // ── Effective stats (z ekwipunkiem) ─────────────────
  // Te metody są SoT dla wyświetlania i dla `buildPlayerCombatant`.
  // Konwencja: wszystkie sumują bazę + primary/attribute + ekwipunek.

  /** Bazowy crit % w walce (constant w `combat.ts:CRIT_CHANCE`). */
  static readonly BASE_CRIT_PCT = 15;

  /** Łączny bonus crit z ekwipunku (weapon + armor + tool) — z upgradami. */
  critBonusFromEquipment(p: PlayerStats): number {
    const w = this.equippedItem(p, 'weapon');
    const a = this.equippedItem(p, 'armor');
    const t = this.equippedItem(p, 'tool');
    return (
      (w ? appliedItemStats(w).crit ?? 0 : 0) +
      (a ? appliedItemStats(a).crit ?? 0 : 0) +
      (t ? appliedItemStats(t).crit ?? 0 : 0)
    );
  }

  /** Pełen crit % w walce — baza + primary/attribute + ekwipunek. */
  effectiveCritPercent(p: PlayerStats): number {
    return PlayerStatsService.BASE_CRIT_PCT + this.critBonus(p) + this.critBonusFromEquipment(p);
  }

  /**
   * Skrócony "score" siły bojowej — używany do skalowania trudności (np.
   * decyzji ile mobów spawnuje ambush). HP + 4×dmg + 2×def to rozsądny
   * pojedynczy wskaźnik łączący żywotność, ofensywę i obronę.
   */
  combatPower(p: PlayerStats): number {
    return (
      this.effectiveMaxHp(p) +
      this.effectiveDamageBonus(p) * 4 +
      this.effectiveDefenseBonus(p) * 2
    );
  }

  /** Pełen max HP — base + primary + attribute + ekwipunek (z upgradami) + armor red gemy. */
  effectiveMaxHp(p: PlayerStats): number {
    const w = this.equippedItem(p, 'weapon');
    const a = this.equippedItem(p, 'armor');
    const t = this.equippedItem(p, 'tool');
    return (
      this.hpFor(p) +
      (w ? appliedItemStats(w).hp ?? 0 : 0) +
      (a ? appliedItemStats(a).hp ?? 0 : 0) +
      (t ? appliedItemStats(t).hp ?? 0 : 0) +
      this.armorGemHpBonus(p)
    );
  }

  /** Pełen damage bonus — primary/attribute + ekwipunek (z upgradami). */
  effectiveDamageBonus(p: PlayerStats): number {
    const w = this.equippedItem(p, 'weapon');
    const a = this.equippedItem(p, 'armor');
    const t = this.equippedItem(p, 'tool');
    return (
      this.damageBonus(p) +
      (w ? appliedItemStats(w).attack ?? 0 : 0) +
      (a ? appliedItemStats(a).attack ?? 0 : 0) +
      (t ? appliedItemStats(t).attack ?? 0 : 0)
    );
  }

  /** Pełen defense bonus — primary/attribute + ekwipunek (głównie armor) + armor blue gemy. */
  effectiveDefenseBonus(p: PlayerStats): number {
    const a = this.equippedItem(p, 'armor');
    return (
      this.defenseBonus(p) +
      (a ? appliedItemStats(a).defense ?? 0 : 0) +
      this.armorGemDefenseBonus(p)
    );
  }

  /**
   * Inicjatywa w walce — class.baseSpeed + AGI + speed z ekwipunku. Wyższy
   * speed = combatant atakuje pierwszy. `combat-battle.ts` sortuje fazy
   * skill/item/attack po speed desc. Gracz bez klasy startuje z baseSpeed = 0.
   */
  effectiveSpeed(p: PlayerStats): number {
    const w = this.equippedItem(p, 'weapon');
    const a = this.equippedItem(p, 'armor');
    const t = this.equippedItem(p, 'tool');
    const classBase = p.classId ? (CLASSES[p.classId]?.baseSpeed ?? 0) : 0;
    return (
      classBase +
      p.primary.agi +
      (w ? appliedItemStats(w).speed ?? 0 : 0) +
      (a ? appliedItemStats(a).speed ?? 0 : 0) +
      (t ? appliedItemStats(t).speed ?? 0 : 0)
    );
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
    this.itemsByUid.set(item.uid, item);
    let set = this.itemsByUser.get(p.id);
    if (!set) {
      set = new Set();
      this.itemsByUser.set(p.id, set);
    }
    set.add(item.uid);
  }

  removeItem(p: PlayerStats, uid: string): ItemInstance | null {
    const set = this.itemsByUser.get(p.id);
    if (!set || !set.has(uid)) return null;
    const item = this.itemsByUid.get(uid);
    if (!item) return null;
    set.delete(uid);
    this.itemsByUid.delete(uid);
    this.itemsToDelete.add(uid);
    return item;
  }

  findItem(p: PlayerStats, uid: string): ItemInstance | undefined {
    const set = this.itemsByUser.get(p.id);
    if (!set || !set.has(uid)) return undefined;
    return this.itemsByUid.get(uid);
  }

  /** Wszystkie itemy gracza — używać zamiast bezpośredniego dostępu do `inventory.items`. */
  getItemsForPlayer(userId: string): ItemInstance[] {
    const set = this.itemsByUser.get(userId);
    if (!set) return [];
    const out: ItemInstance[] = [];
    for (const uid of set) {
      const item = this.itemsByUid.get(uid);
      if (item) out.push(item);
    }
    return out;
  }

  // ── Equipment ──────────────────────────────────────
  equip(p: PlayerStats, uid: string): { ok: boolean; reason?: string; item?: ItemInstance } {
    const item = this.findItem(p, uid);
    if (!item || !item.slot)
      return {
        ok: false,
        reason: 'Nie posiadasz takiego itemu lub nie da się go założyć.',
      };
    if (item.identified === false) {
      return {
        ok: false,
        reason: '🔍 Item nie jest zidentyfikowany — odwiedź **Skrybę** w mieście żeby poznać statystyki.',
      };
    }
    const reqLvl = itemRequiredLevel(item);
    if (reqLvl > 0 && p.skills.combat.level < reqLvl) {
      return {
        ok: false,
        reason: `Item wymaga combat lvl **${reqLvl}** (masz ${p.skills.combat.level}). Każdy upgrade dodaje +1 do wymaganego lvl.`,
      };
    }
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

  /**
   * Zwraca dowolne posiadane (założone lub w plecaku) narzędzie danego typu.
   * Używane przez gathering — gracz nie musi przekładać slotu, żeby wymienić
   * kilof na siekierę. Preferuje założony slot tool jeśli pasuje (np. lepszy
   * tier), inaczej bierze pierwszy z plecaka.
   */
  toolOfKind(p: PlayerStats, kind: ToolKind): ItemInstance | undefined {
    const equipped = this.equippedItem(p, 'tool');
    if (equipped?.toolKind === kind) return equipped;
    return this.getItemsForPlayer(p.id).find((it) => it.toolKind === kind);
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
    grantedSkills: readonly string[] = [],
  ): { ok: boolean; reason?: string } {
    if (p.classId)
      return {
        ok: false,
        reason: `Masz już klasę: ${p.classId}. Wybór jest dożywotni.`,
      };
    p.classId = classId;
    this.addPrimary(p, primaryBonus);
    this.grantSkills(p, grantedSkills);
    return { ok: true };
  }

  applySubclass(
    p: PlayerStats,
    parentClassId: string,
    subclassId: string,
    primaryBonus: PrimaryStats,
    requiredCombatLevel: number,
    grantedSkills: readonly string[] = [],
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
    this.grantSkills(p, grantedSkills);
    return { ok: true };
  }

  applySubclass2(
    p: PlayerStats,
    parentSubId: string,
    sub2Id: string,
    primaryBonus: PrimaryStats,
    requiredCombatLevel: number,
    grantedSkills: readonly string[] = [],
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
    this.grantSkills(p, grantedSkills);
    return { ok: true };
  }

  /** Dodaje skille do `learnedSkills` z dedupem (auto-grant z klasy/subklasy). */
  grantSkills(p: PlayerStats, skillIds: readonly string[]): void {
    for (const id of skillIds) {
      if (!p.learnedSkills.includes(id)) p.learnedSkills.push(id);
    }
  }

  hasLearnedSkill(p: PlayerStats, skillId: string): boolean {
    return p.learnedSkills.includes(skillId);
  }

  /** Drop księgi super-spella z bossa — dodaje do `unlearnedBooks` z dedupem. */
  grantBook(p: PlayerStats, skillId: string): boolean {
    if (p.learnedSkills.includes(skillId)) return false;
    if (p.unlearnedBooks.includes(skillId)) return false;
    p.unlearnedBooks.push(skillId);
    return true;
  }

  hasBook(p: PlayerStats, skillId: string): boolean {
    return p.unlearnedBooks.includes(skillId);
  }

  consumeBook(p: PlayerStats, skillId: string): void {
    p.unlearnedBooks = p.unlearnedBooks.filter((id) => id !== skillId);
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
    // Wyuczone skille tracimy razem z klasą — gracz musi wyuczyć od nowa
    // po pickClass nowej. Starting/bonus auto-grantowane przy nowym pick.
    // Super-spelle (universal) zostają — book drops są permanentne.
    p.learnedSkills = p.learnedSkills.filter((id) => {
      // Heurystyka: super-spelle są zapisane jako nazwy z `_` w ID i są
      // w SUPER_SKILLS — ale żeby uniknąć cyklu importów, lepiej wyczyścić
      // wszystko i zostawić rebuild via class pick + unlearnedBooks.
      // Tu prosto: wszystko leci. Super-spelle w unlearnedBooks dalej OK.
      return false;
    });
  }
}
