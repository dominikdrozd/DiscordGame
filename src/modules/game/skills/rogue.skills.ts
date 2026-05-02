import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const ROGUE_SKILLS: Record<string, Skill> = {
  cios_w_plecy: {
    id: 'cios_w_plecy',
    name: 'Cios w Plecy',
    description: 'Atak ignorujący obronę z mnożnikiem ×1.5 dmg.',
    cooldown: 2,
    targeting: 'enemy',
    classes: ['lotrzyk', 'cien', 'trujacy'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje cios w plecy — ale nie ma celu.`;
      const dmg = Math.floor((12 + Math.floor(Math.random() * 12) + caster.damageBonus) * 1.5);
      target.hp = Math.max(0, target.hp - dmg);
      return `🗡️ **${caster.name}** wbija **Cios w Plecy** w **${target.name}** za **${dmg}** dmg (ignoruje obronę).`;
    },
  },
  trucizna: {
    id: 'trucizna',
    name: 'Trucizna',
    description: 'DoT 5 dmg/tura przez 3 tury.',
    cooldown: 3,
    targeting: 'enemy',
    classes: ['lotrzyk', 'cien', 'trujacy'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje trucizny — bez celu.`;
      addBuff(target, {
        id: 'trucizna',
        kind: 'dot',
        source: `${caster.name} (trucizna)`,
        ttl: 3,
        amount: 5,
      });
      return `☠️ **${caster.name}** zatruwa **${target.name}** — 5 dmg/turę przez 3 tury.`;
    },
  },
  skok_z_cienia: {
    id: 'skok_z_cienia',
    name: 'Skok z Cienia',
    description: 'Burst attack ×2 dmg z 50% szansą na bonus crit (subklasa Cień).',
    cooldown: 3,
    targeting: 'enemy',
    classes: ['cien'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje skoku z cienia — bez celu.`;
      let dmg = (12 + Math.floor(Math.random() * 12) + caster.damageBonus) * 2;
      const crit = Math.random() < 0.5;
      if (crit) dmg = Math.floor(dmg * 1.5);
      target.hp = Math.max(0, target.hp - dmg);
      return `🌑 **${caster.name}** wskakuje z cienia w **${target.name}** za **${dmg}** dmg${crit ? ' 💥 KRYT!' : ''}.`;
    },
  },
  mgla_trucizn: {
    id: 'mgla_trucizn',
    name: 'Mgła Trucizn',
    description: 'AoE DoT 4 dmg/tura przez 3 tury na wszystkich enemies (subklasa Trujący).',
    cooldown: 4,
    targeting: 'allEnemies',
    classes: ['trujacy'],
    apply(_state, caster, targets) {
      for (const t of targets) {
        addBuff(t, {
          id: 'mgla_trucizn',
          kind: 'dot',
          source: `${caster.name} (mgła)`,
          ttl: 3,
          amount: 4,
        });
      }
      return `🌫️ **${caster.name}** rozpyla **Mgłę Trucizn** — wszyscy wrogowie tracą 4 HP/turę przez 3 tury.`;
    },
  },
  // ── TIER 2 ────────────────────────────────────────
  sztylet_smierci: {
    id: 'sztylet_smierci',
    name: 'Sztylet Śmierci',
    description: 'Gwarantowany krit ×3 dmg na pojedynczy cel (tier-2 Assassyn).',
    cooldown: 5,
    targeting: 'enemy',
    classes: ['assassyn'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** unosi sztylet — bez celu.`;
      const base = 12 + Math.floor(Math.random() * 12) + caster.damageBonus;
      const dmg = base * 3;
      target.hp = Math.max(0, target.hp - dmg);
      return `🗡️💀 **${caster.name}** wbija **Sztylet Śmierci** w **${target.name}** za **${dmg}** dmg 💥 GWARANTOWANY KRYT!`;
    },
  },
  oslepienie: {
    id: 'oslepienie',
    name: 'Oślepienie',
    description: 'Slow + -5 dmg debuff na 3 tury (tier-2 Szpieg).',
    cooldown: 4,
    targeting: 'enemy',
    classes: ['szpieg'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** sypie piaskiem — bez celu.`;
      addBuff(target, {
        id: 'oslepienie_slow',
        kind: 'slow',
        source: 'oslepienie',
        ttl: 1,
      });
      addBuff(target, {
        id: 'oslepienie_dmg',
        kind: 'damage_amp',
        source: 'oslepienie',
        ttl: 3,
        amount: -5,
      });
      return `🌫️ **${caster.name}** **oślepia** **${target.name}** — slow 1 turę + -5 dmg przez 3 tury.`;
    },
  },
  paraliz: {
    id: 'paraliz',
    name: 'Paraliż',
    description: 'DoT 8/turę + slow przez 2 tury (tier-2 Mistrz Jadów).',
    cooldown: 4,
    targeting: 'enemy',
    classes: ['mistrz_jadow'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje paraliżu — bez celu.`;
      const dot = 8 + Math.floor((caster.spellPower ?? 0) * 0.3);
      addBuff(target, {
        id: 'paraliz_dot',
        kind: 'dot',
        source: `${caster.name} (paraliż)`,
        ttl: 3,
        amount: dot,
      });
      addBuff(target, {
        id: 'paraliz_slow',
        kind: 'slow',
        source: 'paraliz',
        ttl: 2,
      });
      return `💉 **${caster.name}** **paraliżuje** **${target.name}** — ${dot} dmg/turę przez 3 tury + slow 2 tury.`;
    },
  },
  mgla_lodu: {
    id: 'mgla_lodu',
    name: 'Mgła Lodu',
    description: 'AoE slow 2 tury + DoT 3/turę na wszystkich wrogów (tier-2 Sługa Śmietli).',
    cooldown: 5,
    targeting: 'allEnemies',
    classes: ['sluga_smietli'],
    apply(_state, caster, targets) {
      for (const t of targets) {
        addBuff(t, {
          id: 'mgla_lodu_slow',
          kind: 'slow',
          source: 'mgla_lodu',
          ttl: 2,
        });
        addBuff(t, {
          id: 'mgla_lodu_dot',
          kind: 'dot',
          source: 'mgla_lodu',
          ttl: 3,
          amount: 3,
        });
      }
      return `❄️🌫️ **${caster.name}** rozpuszcza **Mgłę Lodu** — wszyscy wrogowie spowolnieni (2 tury) i 3 dmg/turę.`;
    },
  },
};
