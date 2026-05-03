import { type Combatant } from './combat.js';
import type { PlayerStats } from '../services/player-stats.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { isCombatConsumable } from '../services/items.js';

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
  // Wszystkie staty przez `effective*` SoT methods — UI i combat zgadzają się.
  const baseHp = stats.effectiveMaxHp(p);
  const damageBonus = stats.effectiveDamageBonus(p);
  const defenseBonus = stats.effectiveDefenseBonus(p);
  // combat.ts dodaje bazę CRIT_CHANCE (0.15) — combatant.critBonus to BONUS bez bazy.
  const critBonus =
    (stats.critBonus(p) + stats.critBonusFromEquipment(p)) / 100;
  const speed = stats.effectiveSpeed(p);
  const consumables = snapshotConsumables(p);
  // Wczytujemy z `learnedSkills` — auto-fill robiony przez applyClass /
  // applySubclass / book drops; `/skills learn` dla ręcznej nauki.
  const skills = [...p.learnedSkills];
  return {
    id: p.id,
    name: p.name,
    hp: baseHp,
    maxHp: baseHp,
    damageBonus,
    defenseBonus,
    critBonus,
    speed,
    primary: { ...p.primary },
    defending: false,
    // Gracze NIE dostają darmowych potek — używają tylko tych z plecaka.
    // `potionsLeft` zostawiamy dla AI/bossów (mob.toCombatant ustawia własne).
    potionsLeft: 0,
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
