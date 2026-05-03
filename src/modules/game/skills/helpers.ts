import type { BattleCombatant } from '../engine/battle-state.js';
import type { Combatant } from '../engine/combat.js';
import { addBuff, type BuffKind } from '../engine/buffs.js';
import { scaledBonus, type SkillStatScaling } from './index.js';

/**
 * Pomocniki używane przez skille (`*.skill.ts`). Wyniesione żeby `apply()`
 * był deklaratywny: zamiast pisać `target.hp = Math.max(0, target.hp - dmg)`
 * w 30 plikach piszemy `applyDamage(target, dmg)`.
 *
 * Wszystkie helpery są pure (zero state), zwracają wartość lub mutują target —
 * nigdy nie modyfikują `state` poza explicit (np. `addBuff` na targecie).
 */

/** Zwraca pierwszego żywego targetu z listy lub linię błędu jeśli pusta. */
export function pickTarget(
  targets: BattleCombatant[],
  casterName: string,
  fallback: string,
): { target: BattleCombatant | null; error?: string } {
  const t = targets[0];
  if (!t) return { target: null, error: `**${casterName}** ${fallback} — bez celu.` };
  return { target: t };
}

/**
 * Standardowy losowy damage: `base + rand(0..variance) + caster.damageBonus + scaling`.
 * `includeWeapon` domyślnie false — większość spelli skaluje tylko z primary.
 * Włącz dla skilli "weapon-style" (backstab, holy hammer, vortex).
 */
export function damageWithVariance(
  base: number,
  variance: number,
  caster: Combatant,
  scaling?: SkillStatScaling,
  includeWeapon = false,
): number {
  const rand = variance > 0 ? Math.floor(Math.random() * variance) : 0;
  const weapon = includeWeapon ? caster.damageBonus : 0;
  return base + rand + weapon + scaledBonus(caster, scaling);
}

/** Aplikuje damage do targetu z clampem do 0. Zwraca rzeczywiste obrażenia. */
export function applyDamage(target: Combatant, dmg: number): number {
  const before = target.hp;
  target.hp = Math.max(0, target.hp - dmg);
  return before - target.hp;
}

/** Aplikuje heal do targetu z clampem do maxHp. Zwraca rzeczywiste leczenie. */
export function applyHeal(target: Combatant, heal: number): number {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + heal);
  return target.hp - before;
}

interface BuffApplyConfig {
  id: string;
  source: string;
  ttl: number;
  baseAmount: number;
  caster?: Combatant;
  scaling?: SkillStatScaling;
}

function buildAmount(cfg: Pick<BuffApplyConfig, 'baseAmount' | 'caster' | 'scaling'>): number {
  return cfg.baseAmount + (cfg.caster ? scaledBonus(cfg.caster, cfg.scaling) : 0);
}

/** DoT (damage-over-time) z opcjonalnym scaling. Zwraca finalną wartość amount/turę. */
export function applyDoT(target: Combatant, cfg: BuffApplyConfig): number {
  const amount = buildAmount(cfg);
  addBuff(target, { id: cfg.id, kind: 'dot', source: cfg.source, ttl: cfg.ttl, amount });
  return amount;
}

/** HoT (heal-over-time) z opcjonalnym scaling. Zwraca amount/turę. */
export function applyHoT(target: Combatant, cfg: BuffApplyConfig): number {
  const amount = buildAmount(cfg);
  addBuff(target, { id: cfg.id, kind: 'hot', source: cfg.source, ttl: cfg.ttl, amount });
  return amount;
}

/** Shield buff — pochłania dmg do `amount`. Zwraca amount. */
export function applyShield(target: Combatant, cfg: BuffApplyConfig): number {
  const amount = buildAmount(cfg);
  addBuff(target, { id: cfg.id, kind: 'shield', source: cfg.source, ttl: cfg.ttl, amount });
  return amount;
}

interface SimpleBuffConfig {
  id: string;
  source: string;
  ttl: number;
  /** amount opcjonalny dla slow (default = 5 w `getSlowAmount`). */
  amount?: number;
}

export function applySlow(target: Combatant, cfg: SimpleBuffConfig): void {
  addBuff(target, {
    id: cfg.id,
    kind: 'slow',
    source: cfg.source,
    ttl: cfg.ttl,
    amount: cfg.amount,
  });
}

/** Damage amp — buff zwiększa lub obniża (-amount) zadawany dmg. */
export function applyDamageAmp(target: Combatant, cfg: Required<SimpleBuffConfig>): void {
  addBuff(target, {
    id: cfg.id,
    kind: 'damage_amp',
    source: cfg.source,
    ttl: cfg.ttl,
    amount: cfg.amount,
  });
}

export function applyDefenseAmp(target: Combatant, cfg: Required<SimpleBuffConfig>): void {
  addBuff(target, {
    id: cfg.id,
    kind: 'defense_amp',
    source: cfg.source,
    ttl: cfg.ttl,
    amount: cfg.amount,
  });
}

export function applyTaunt(target: Combatant, cfg: SimpleBuffConfig & { casterId?: string }): void {
  addBuff(target, {
    id: cfg.id,
    kind: 'taunt',
    source: cfg.source,
    ttl: cfg.ttl,
    casterId: cfg.casterId,
  });
}

/** Generic buff applicator dla rzadkich kindów (lifesteal, evasion, crit_amp). */
export function applyGenericBuff(
  target: Combatant,
  kind: BuffKind,
  cfg: Required<SimpleBuffConfig>,
): void {
  addBuff(target, {
    id: cfg.id,
    kind,
    source: cfg.source,
    ttl: cfg.ttl,
    amount: cfg.amount,
  });
}

/** Standardowy line dla single-target dmg. `extra` doklejony przed kropką. */
export function formatDamageLine(
  emoji: string,
  caster: Combatant,
  skillName: string,
  target: Combatant,
  dmg: number,
  extra = '',
): string {
  return `${emoji} **${caster.name}** rzuca **${skillName}** w **${target.name}** za **${dmg}** dmg${extra}.`;
}

/** Standardowy line dla AoE dmg z listą "**name**: -dmg". */
export function formatAoeLine(
  emoji: string,
  caster: Combatant,
  skillName: string,
  dmg: number,
  perTargetLines: string[],
): string {
  return `${emoji} **${caster.name}** rzuca **${skillName}** (${dmg} AoE): ${perTargetLines.join(', ')}`;
}
