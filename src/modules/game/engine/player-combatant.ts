import { POTIONS_START, type Combatant } from './combat.js';
import type { PlayerStats } from '../services/player-stats.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { isCombatConsumable } from '../services/items.js';
import { CLASSES, findSubclass, findSubclass2 } from '../classes/index.js';

function snapshotConsumables(p: PlayerStats): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(p.inventory.resources)) {
    if (isCombatConsumable(id) && qty > 0) out[id] = qty;
  }
  return out;
}

export function buildPlayerCombatant(
  stats: PlayerStatsService,
  p: PlayerStats,
): Combatant & { id: string } {
  const weapon = stats.equippedItem(p, 'weapon');
  const armor = stats.equippedItem(p, 'armor');
  const baseHp = stats.hpFor(p) + (armor?.stats.hp ?? 0) + (weapon?.stats.hp ?? 0);
  const damageBonus =
    stats.damageBonus(p) + (weapon?.stats.attack ?? 0) + (armor?.stats.attack ?? 0);
  const defenseBonus = stats.defenseBonus(p) + (armor?.stats.defense ?? 0);
  const critBonus = (stats.critBonus(p) + (weapon?.stats.crit ?? 0)) / 100;
  const consumables = snapshotConsumables(p);
  const skills: string[] = [];
  if (p.classId) {
    const cls = CLASSES[p.classId];
    if (cls) skills.push(...cls.startingSkills);
    if (p.subclassId) {
      const sc = findSubclass(p.classId, p.subclassId);
      if (sc) skills.push(...sc.bonusSkills);
      if (p.subclass2Id) {
        const sc2 = findSubclass2(p.classId, p.subclassId, p.subclass2Id);
        if (sc2) skills.push(...sc2.bonusSkills);
      }
    }
  }
  return {
    id: p.id,
    name: p.name,
    hp: baseHp,
    maxHp: baseHp,
    damageBonus,
    defenseBonus,
    critBonus,
    defending: false,
    potionsLeft: POTIONS_START,
    consumables,
    consumablesStart: { ...consumables },
    skills,
    skillCooldowns: {},
    buffs: [],
    spellPower: stats.spellPower(p),
  };
}

export function consumablesUsed(
  start: Record<string, number>,
  current: Record<string, number>,
): Record<string, number> {
  const used: Record<string, number> = {};
  for (const [itemId, startQty] of Object.entries(start)) {
    const remaining = current[itemId] ?? 0;
    const diff = startQty - remaining;
    if (diff > 0) used[itemId] = diff;
  }
  return used;
}
