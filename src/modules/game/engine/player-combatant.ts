import { type Combatant } from './combat.js';
import type { BattleCombatant } from './battle-state.js';
import type { PlayerStats } from '../services/player-stats.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { isCombatConsumable } from '../services/items.js';
import { gemWeaponEffect, type WeaponGemEffect } from '../services/gem-effects.js';
import type { Buff } from './buffs.js';

function snapshotConsumables(p: PlayerStats): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(p.inventory.resources)) {
    if (isCombatConsumable(id) && qty > 0) out[id] = qty;
  }
  return out;
}

/**
 * Wyciąga gemy z założonej (i zidentyfikowanej) broni do listy effects.
 * Pusta lista gdy brak broni / brak gemów / niezidentyfikowana.
 */
function snapshotWeaponGems(stats: PlayerStatsService, p: PlayerStats): WeaponGemEffect[] {
  const w = stats.equippedItem(p, 'weapon');
  if (!w || w.identified === false || !w.gems || w.gems.length === 0) return [];
  const out: WeaponGemEffect[] = [];
  for (const id of w.gems) {
    if (!id) continue;
    const eff = gemWeaponEffect(id);
    if (eff) out.push(eff);
  }
  return out;
}

/**
 * Buduje startowe buffy dla armor green gemów — HoT z period=2 (regen co 2 tury).
 * Suma `armorGemHotAmount` z player-stats. ttl: 999 = "perpetual" w czasie walki.
 */
function buildArmorRegenBuffs(stats: PlayerStatsService, p: PlayerStats): Buff[] {
  const amount = stats.armorGemHotAmount(p);
  if (amount <= 0) return [];
  return [
    {
      id: 'armor_regen',
      kind: 'hot',
      source: 'Regeneracja Pancerza',
      ttl: 999,
      amount,
      period: 2,
      phase: 0,
    },
  ];
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
    primary: stats.effectivePrimary(p),
    defending: false,
    // Gracze NIE dostają darmowych potek — używają tylko tych z plecaka.
    // `potionsLeft` zostawiamy dla AI/bossów (mob.toCombatant ustawia własne).
    potionsLeft: 0,
    consumables,
    consumablesStart: { ...consumables },
    skills,
    skillCooldowns: {},
    buffs: buildArmorRegenBuffs(stats, p),
    spellPower: stats.spellPower(p),
    weaponGems: snapshotWeaponGems(stats, p),
  };
}

/**
 * Convenience wrapper: `buildPlayerCombatant` + team/controller='human'
 * w jednym kroku. Wcześniej ten pattern powtarzał się ~8 razy w services.
 */
export function buildHumanCombatant(
  stats: PlayerStatsService,
  player: PlayerStats,
  team = 0,
): BattleCombatant {
  return {
    ...buildPlayerCombatant(stats, player),
    team,
    controller: 'human',
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
