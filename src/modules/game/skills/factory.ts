import type {
  Skill,
  SkillRequirements,
  SkillStatScaling,
} from './index.js';
import { scaledBonus } from './index.js';
import {
  applyDamage,
  applyDamageAmp,
  applyDefenseAmp,
  applyDoT,
  applyHeal,
  applyHoT,
  applyShield,
  applySlow,
  damageWithVariance,
  formatAoeLine,
  formatDamageLine,
  pickTarget,
} from './helpers.js';
import type { BattleCombatant, BattleState } from '../engine/battle-state.js';

/**
 * Factory dla deklaratywnych skilli. Każdy `create*Skill` zwraca pełen
 * `Skill` z gotowym `apply()`. Skille z customową logiką (cleanse, second-hit
 * chance, conditional targeting) zostają jako plain `Skill` z własnym
 * `apply()`, ale używają helperów z `helpers.ts`.
 */

interface BaseSkillMeta {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  classes: string[];
  scaling?: SkillStatScaling;
  requirements?: SkillRequirements;
  universal?: boolean;
}

interface DamageSkillConfig extends BaseSkillMeta {
  targeting: 'enemy' | 'allEnemies';
  emoji: string;
  /** Bazowy dmg przed mnożnikiem. */
  base: number;
  /** Zakres losu (0..variance). 0 = brak losu. */
  variance: number;
  /** Mnożnik na końcu (np. 1.5 dla cios w plecy, 0.6 dla AoE 60%). */
  multiplier?: number;
  /** Czy włączyć damageBonus castera (weapon-style skille). */
  includeWeapon?: boolean;
  /** Akcja po damage'u (np. dodaj slow buff). Zwracany string doklejany do return. */
  followup?: (target: BattleCombatant, caster: BattleCombatant, state: BattleState) => string | void;
  /** Override domyślnego return string'u. */
  formatLine?: (caster: BattleCombatant, target: BattleCombatant, dmg: number) => string;
}

export function createDamageSkill(cfg: DamageSkillConfig): Skill {
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    cooldown: cfg.cooldown,
    targeting: cfg.targeting,
    classes: cfg.classes,
    scaling: cfg.scaling,
    requirements: cfg.requirements,
    universal: cfg.universal,
    apply(state, caster, targets) {
      if (cfg.targeting === 'enemy') {
        const { target, error } = pickTarget(targets, caster.name, `próbuje **${cfg.name}**`);
        if (!target) return error!;
        let dmg = damageWithVariance(cfg.base, cfg.variance, caster, cfg.scaling, cfg.includeWeapon);
        if (cfg.multiplier) dmg = Math.floor(dmg * cfg.multiplier);
        applyDamage(target, dmg);
        const extra = cfg.followup?.(target, caster, state);
        if (cfg.formatLine) return cfg.formatLine(caster, target, dmg);
        return formatDamageLine(cfg.emoji, caster, cfg.name, target, dmg, extra ? ` ${extra}` : '');
      }
      // allEnemies (AoE)
      let baseDmg = damageWithVariance(cfg.base, cfg.variance, caster, cfg.scaling, cfg.includeWeapon);
      if (cfg.multiplier) baseDmg = Math.floor(baseDmg * cfg.multiplier);
      const dmg = Math.max(1, baseDmg);
      const lines: string[] = [];
      for (const t of targets) {
        applyDamage(t, dmg);
        cfg.followup?.(t, caster, state);
        lines.push(`${cfg.emoji} **${t.name}**: -${dmg}`);
      }
      return formatAoeLine(cfg.emoji, caster, cfg.name, dmg, lines);
    },
  };
}

interface DoTSkillConfig extends BaseSkillMeta {
  targeting: 'enemy' | 'allEnemies';
  emoji: string;
  /** Bazowa wartość dmg/turę. */
  baseAmount: number;
  ttl: number;
  /** Opcjonalny dodatkowy buff (np. slow razem z DoT). */
  followup?: (target: BattleCombatant, caster: BattleCombatant) => void;
}

export function createDoTSkill(cfg: DoTSkillConfig): Skill {
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    cooldown: cfg.cooldown,
    targeting: cfg.targeting,
    classes: cfg.classes,
    scaling: cfg.scaling,
    requirements: cfg.requirements,
    universal: cfg.universal,
    apply(_state, caster, targets) {
      if (cfg.targeting === 'enemy') {
        const { target, error } = pickTarget(targets, caster.name, `próbuje **${cfg.name}**`);
        if (!target) return error!;
        const amount = applyDoT(target, {
          id: cfg.id,
          source: `${caster.name} (${cfg.name})`,
          ttl: cfg.ttl,
          baseAmount: cfg.baseAmount,
          caster,
          scaling: cfg.scaling,
        });
        cfg.followup?.(target, caster);
        return `${cfg.emoji} **${caster.name}** zadaje **${cfg.name}** **${target.name}** — ${amount} dmg/turę przez ${cfg.ttl} tury.`;
      }
      let amount = 0;
      for (const t of targets) {
        amount = applyDoT(t, {
          id: cfg.id,
          source: cfg.id,
          ttl: cfg.ttl,
          baseAmount: cfg.baseAmount,
          caster,
          scaling: cfg.scaling,
        });
        cfg.followup?.(t, caster);
      }
      return `${cfg.emoji} **${caster.name}** rozsiewa **${cfg.name}** — wszyscy wrogowie ${amount} dmg/turę przez ${cfg.ttl} tury.`;
    },
  };
}

interface HealSkillConfig extends BaseSkillMeta {
  targeting: 'self' | 'ally' | 'allAllies';
  emoji: string;
  baseHeal: number;
  variance?: number;
}

export function createHealSkill(cfg: HealSkillConfig): Skill {
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    cooldown: cfg.cooldown,
    targeting: cfg.targeting,
    classes: cfg.classes,
    scaling: cfg.scaling,
    requirements: cfg.requirements,
    universal: cfg.universal,
    apply(_state, caster, targets) {
      const heal = damageWithVariance(cfg.baseHeal, cfg.variance ?? 0, caster, cfg.scaling);
      if (cfg.targeting === 'self') {
        const restored = applyHeal(caster, heal);
        return `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}** (+${restored} HP).`;
      }
      if (cfg.targeting === 'ally') {
        const { target, error } = pickTarget(targets, caster.name, `próbuje **${cfg.name}**`);
        if (!target) return error!;
        const restored = applyHeal(target, heal);
        return `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}** na **${target.name}** (+${restored} HP).`;
      }
      // allAllies
      const lines: string[] = [];
      for (const t of targets) {
        const restored = applyHeal(t, heal);
        lines.push(`**${t.name}**: +${restored} HP`);
      }
      return `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}**: ${lines.join(', ')}`;
    },
  };
}

interface SimpleBuffSkillConfig extends BaseSkillMeta {
  targeting: 'self' | 'ally' | 'allAllies';
  emoji: string;
  kind: 'damage_amp' | 'defense_amp' | 'shield' | 'hot' | 'slow';
  baseAmount: number;
  ttl: number;
  /** Custom result string (override domyślnego). */
  formatLine?: (caster: BattleCombatant, target: BattleCombatant, amount: number) => string;
}

export function createBuffSkill(cfg: SimpleBuffSkillConfig): Skill {
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    cooldown: cfg.cooldown,
    targeting: cfg.targeting,
    classes: cfg.classes,
    scaling: cfg.scaling,
    requirements: cfg.requirements,
    universal: cfg.universal,
    apply(_state, caster, targets) {
      const apply1 = (target: BattleCombatant): number => {
        if (cfg.kind === 'damage_amp') {
          const amount = cfg.baseAmount + (cfg.scaling ? scaledBonus(caster, cfg.scaling) : 0);
          applyDamageAmp(target, { id: cfg.id, source: cfg.id, ttl: cfg.ttl, amount });
          return amount;
        }
        if (cfg.kind === 'defense_amp') {
          const amount = cfg.baseAmount + (cfg.scaling ? scaledBonus(caster, cfg.scaling) : 0);
          applyDefenseAmp(target, { id: cfg.id, source: cfg.id, ttl: cfg.ttl, amount });
          return amount;
        }
        if (cfg.kind === 'shield') {
          return applyShield(target, {
            id: cfg.id,
            source: cfg.id,
            ttl: cfg.ttl,
            baseAmount: cfg.baseAmount,
            caster,
            scaling: cfg.scaling,
          });
        }
        if (cfg.kind === 'hot') {
          return applyHoT(target, {
            id: cfg.id,
            source: cfg.id,
            ttl: cfg.ttl,
            baseAmount: cfg.baseAmount,
            caster,
            scaling: cfg.scaling,
          });
        }
        // slow
        applySlow(target, { id: cfg.id, source: cfg.id, ttl: cfg.ttl, amount: cfg.baseAmount });
        return cfg.baseAmount;
      };
      if (cfg.targeting === 'self') {
        const amount = apply1(caster);
        return cfg.formatLine
          ? cfg.formatLine(caster, caster, amount)
          : `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}** (${amount}).`;
      }
      if (cfg.targeting === 'ally') {
        const { target, error } = pickTarget(targets, caster.name, `próbuje **${cfg.name}**`);
        if (!target) return error!;
        const amount = apply1(target);
        return cfg.formatLine
          ? cfg.formatLine(caster, target, amount)
          : `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}** na **${target.name}** (${amount}).`;
      }
      // allAllies
      let amount = 0;
      for (const t of targets) amount = apply1(t);
      return `${cfg.emoji} **${caster.name}** rzuca **${cfg.name}** na całą drużynę (${amount}).`;
    },
  };
}
