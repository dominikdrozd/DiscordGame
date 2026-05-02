import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const MAGE_SKILLS: Record<string, Skill> = {
  kula_ognia: {
    id: 'kula_ognia',
    name: 'Kula Ognia',
    description: 'AoE — 60% standardowego dmg na wszystkich enemies.',
    cooldown: 2,
    targeting: 'allEnemies',
    classes: ['mag', 'pirokineta', 'mroziciel'],
    apply(_state, caster, targets) {
      const lines: string[] = [];
      const baseDmg = 10 + Math.floor(Math.random() * 10) + (caster.spellPower ?? 0);
      const dmg = Math.max(1, Math.floor(baseDmg * 0.6));
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        lines.push(`🔥 **${t.name}**: -${dmg}`);
      }
      return `🔥 **${caster.name}** ciska **Kulą Ognia** (${dmg} AoE): ${lines.join(', ')}`;
    },
  },
  lodowy_grad: {
    id: 'lodowy_grad',
    name: 'Lodowy Grad',
    description: 'Single-target dmg + slow (przeciwnik traci następną turę).',
    cooldown: 3,
    targeting: 'enemy',
    classes: ['mag', 'pirokineta', 'mroziciel'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje grad — bez celu.`;
      const dmg = 14 + Math.floor(Math.random() * 8) + (caster.spellPower ?? 0);
      target.hp = Math.max(0, target.hp - dmg);
      addBuff(target, {
        id: 'slow',
        kind: 'slow',
        source: 'lodowy_grad',
        ttl: 1,
      });
      return `❄️ **${caster.name}** rzuca **Lodowy Grad** w **${target.name}** za **${dmg}** dmg + slow.`;
    },
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    description: 'Potężne AoE (90% dmg) z dodatkową szansą na DoT (subklasa Pirokineta).',
    cooldown: 5,
    targeting: 'allEnemies',
    classes: ['pirokineta'],
    apply(_state, caster, targets) {
      const lines: string[] = [];
      const baseDmg = 18 + Math.floor(Math.random() * 12) + (caster.spellPower ?? 0);
      const dmg = Math.floor(baseDmg * 0.9);
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        lines.push(`☄️ **${t.name}**: -${dmg}`);
        if (Math.random() < 0.5) {
          addBuff(t, {
            id: 'spalenie',
            kind: 'dot',
            source: 'meteor',
            ttl: 2,
            amount: 4,
          });
        }
      }
      return `☄️ **${caster.name}** zrzuca **Meteor** (${dmg} AoE): ${lines.join(', ')}`;
    },
  },
  mrozny_strzal: {
    id: 'mrozny_strzal',
    name: 'Mroźny Strzał',
    description: 'Big single-target + freeze 2 tury (subklasa Mroziciel).',
    cooldown: 4,
    targeting: 'enemy',
    classes: ['mroziciel'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje mroźnego strzału — bez celu.`;
      const dmg = 20 + Math.floor(Math.random() * 10) + (caster.spellPower ?? 0);
      target.hp = Math.max(0, target.hp - dmg);
      addBuff(target, {
        id: 'freeze',
        kind: 'slow',
        source: 'mrozny_strzal',
        ttl: 2,
      });
      return `🥶 **${caster.name}** zamraża **${target.name}** za **${dmg}** dmg + slow 2 tury.`;
    },
  },
  // ── TIER 2 ────────────────────────────────────────
  odrodzenie: {
    id: 'odrodzenie',
    name: 'Odrodzenie z Phoenixa',
    description: 'Self heal +60 HP (skaluje z INT, tier-2 Władca Phoenixa).',
    cooldown: 6,
    targeting: 'self',
    classes: ['wladca_phoenixa'],
    apply(_state, caster) {
      const heal = 60 + Math.floor((caster.spellPower ?? 0) * 1.2);
      const before = caster.hp;
      caster.hp = Math.min(caster.maxHp, caster.hp + heal);
      return `🔥🦅 **${caster.name}** **odradza się z Phoenixa** (+${caster.hp - before} HP).`;
    },
  },
  pieklo: {
    id: 'pieklo',
    name: 'Piekło',
    description: 'AoE 100% dmg + DoT 6/turę 2 tury na wszystkich wrogów (tier-2 Inferno).',
    cooldown: 6,
    targeting: 'allEnemies',
    classes: ['inferno'],
    apply(_state, caster, targets) {
      const dmg = 14 + Math.floor(Math.random() * 12) + (caster.spellPower ?? 0);
      const lines: string[] = [];
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        lines.push(`🔥 **${t.name}**: -${dmg}`);
        addBuff(t, {
          id: 'pieklo_dot',
          kind: 'dot',
          source: 'pieklo',
          ttl: 2,
          amount: 6,
        });
      }
      return `🔥🔥 **${caster.name}** otwiera **Piekło** (${dmg} AoE + 6 DoT 2 tury): ${lines.join(', ')}`;
    },
  },
  lodowa_burza: {
    id: 'lodowa_burza',
    name: 'Lodowa Burza',
    description: 'AoE dmg + freeze 2 tury wszystkim wrogom (tier-2 Arktoman).',
    cooldown: 6,
    targeting: 'allEnemies',
    classes: ['arktoman'],
    apply(_state, caster, targets) {
      const dmg = 12 + Math.floor(Math.random() * 8) + Math.floor((caster.spellPower ?? 0) * 0.7);
      const lines: string[] = [];
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        addBuff(t, {
          id: 'lodowa_burza_freeze',
          kind: 'slow',
          source: 'lodowa_burza',
          ttl: 2,
        });
        lines.push(`❄️ **${t.name}**: -${dmg}`);
      }
      return `❄️🌪️ **${caster.name}** wzywa **Lodową Burzę** (${dmg} AoE + freeze 2 tury): ${lines.join(', ')}`;
    },
  },
  krysztal_obrony: {
    id: 'krysztal_obrony',
    name: 'Kryształ Obrony',
    description: 'Tarcza 50 dmg na ally (skaluje z WIT, tier-2 Krystaliczny).',
    cooldown: 4,
    targeting: 'ally',
    classes: ['krystaliczny'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje kryształu — bez celu.`;
      const amount = 50 + Math.floor((caster.spellPower ?? 0) * 0.6);
      addBuff(target, {
        id: 'krysztal_obrony',
        kind: 'shield',
        source: 'krysztal_obrony',
        ttl: 4,
        amount,
      });
      return `💎 **${caster.name}** otacza **${target.name}** **Kryształem Obrony** (pochłonie ${amount} dmg).`;
    },
  },
};
