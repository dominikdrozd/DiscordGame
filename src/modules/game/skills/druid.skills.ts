import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const DRUID_SKILLS: Record<string, Skill> = {
  splot_korzeni: {
    id: 'splot_korzeni',
    name: 'Splot Korzeni',
    description: 'HoT 8 hp/tura przez 3 tury na ally.',
    cooldown: 3,
    targeting: 'ally',
    classes: ['druid', 'korzennik', 'burza'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje splotu — bez celu.`;
      const heal = 8 + Math.floor((caster.spellPower ?? 0) * 0.5);
      addBuff(target, {
        id: 'splot_korzeni',
        kind: 'hot',
        source: `${caster.name}`,
        ttl: 3,
        amount: heal,
      });
      return `🌿 **${caster.name}** owija **${target.name}** korzeniami — +${heal} HP/turę przez 3 tury.`;
    },
  },
  kora_debu: {
    id: 'kora_debu',
    name: 'Kora Dębu',
    description: '+5 def na ally na 2 tury.',
    cooldown: 2,
    targeting: 'ally',
    classes: ['druid', 'korzennik', 'burza'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje kory — bez celu.`;
      addBuff(target, {
        id: 'kora_debu',
        kind: 'defense_amp',
        source: 'kora_debu',
        ttl: 2,
        amount: 5,
      });
      return `🌳 **${caster.name}** opancerza **${target.name}** korą dębu — +5 def przez 2 tury.`;
    },
  },
  gaj_zycia: {
    id: 'gaj_zycia',
    name: 'Gaj Życia',
    description: 'AoE HoT 6 hp/tura przez 3 tury na całą drużynę (subklasa Korzennik).',
    cooldown: 5,
    targeting: 'allAllies',
    classes: ['korzennik'],
    apply(_state, caster, targets) {
      const heal = 6 + Math.floor((caster.spellPower ?? 0) * 0.4);
      for (const t of targets) {
        addBuff(t, {
          id: 'gaj_zycia',
          kind: 'hot',
          source: 'gaj_zycia',
          ttl: 3,
          amount: heal,
        });
      }
      return `🌳 **${caster.name}** wzywa **Gaj Życia** — wszyscy ally regenerują +${heal} HP/turę przez 3 tury.`;
    },
  },
  piorun: {
    id: 'piorun',
    name: 'Piorun',
    description: 'Burst single-target dmg z bonusem od INT (subklasa Burza).',
    cooldown: 3,
    targeting: 'enemy',
    classes: ['burza'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje piorunować — bez celu.`;
      const dmg = 16 + Math.floor(Math.random() * 10) + (caster.spellPower ?? 0);
      target.hp = Math.max(0, target.hp - dmg);
      return `⚡ **${caster.name}** ciska **Piorun** w **${target.name}** za **${dmg}** dmg.`;
    },
  },
  // ── TIER 2 ────────────────────────────────────────
  skarbnica_zycia: {
    id: 'skarbnica_zycia',
    name: 'Skarbnica Życia',
    description: 'AoE HoT 10/turę przez 4 tury na całą drużynę (tier-2 Drzewo Przodek).',
    cooldown: 6,
    targeting: 'allAllies',
    classes: ['drzewo_przodek'],
    apply(_state, caster, targets) {
      const heal = 10 + Math.floor((caster.spellPower ?? 0) * 0.5);
      for (const t of targets) {
        addBuff(t, {
          id: 'skarbnica_zycia',
          kind: 'hot',
          source: 'skarbnica_zycia',
          ttl: 4,
          amount: heal,
        });
      }
      return `🌳✨ **${caster.name}** otwiera **Skarbnicę Życia** — wszyscy ally regenerują +${heal} HP/turę przez 4 tury.`;
    },
  },
  promien_slonca: {
    id: 'promien_slonca',
    name: 'Promień Słońca',
    description: 'Burst heal +50 HP na ally + cleanse 1 debuffa (tier-2 Słoneczny).',
    cooldown: 4,
    targeting: 'ally',
    classes: ['sloneczny'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje promień — bez celu.`;
      const heal = 50 + Math.floor((caster.spellPower ?? 0) * 1.1);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      let cleansed = '';
      if (target.buffs && target.buffs.length > 0) {
        const debuffIdx = target.buffs.findIndex(
          (b) =>
            b.kind === 'dot' ||
            b.kind === 'slow' ||
            (b.kind === 'damage_amp' && (b.amount ?? 0) < 0),
        );
        if (debuffIdx >= 0) {
          const removed = target.buffs[debuffIdx];
          target.buffs.splice(debuffIdx, 1);
          cleansed = ` + cleanse **${removed.source}**`;
        }
      }
      return `☀️ **${caster.name}** rzuca **Promień Słońca** na **${target.name}** (+${target.hp - before} HP${cleansed}).`;
    },
  },
  tornado: {
    id: 'tornado',
    name: 'Tornado',
    description: 'AoE dmg + slow na wszystkich wrogów (tier-2 Grzmot).',
    cooldown: 5,
    targeting: 'allEnemies',
    classes: ['grzmot'],
    apply(_state, caster, targets) {
      const dmg = 12 + Math.floor(Math.random() * 8) + Math.floor((caster.spellPower ?? 0) * 0.8);
      const lines: string[] = [];
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        addBuff(t, {
          id: 'tornado_slow',
          kind: 'slow',
          source: 'tornado',
          ttl: 1,
        });
        lines.push(`🌪️ **${t.name}**: -${dmg}`);
      }
      return `🌪️⚡ **${caster.name}** wzywa **Tornado** (${dmg} AoE + slow 1 turę): ${lines.join(', ')}`;
    },
  },
  wir: {
    id: 'wir',
    name: 'Wir Żywiołów',
    description: 'AoE dmg ×0.7 + szansa na drugi cios przy każdym wrogu (tier-2 Żywioł).',
    cooldown: 4,
    targeting: 'allEnemies',
    classes: ['zywiol'],
    apply(_state, caster, targets) {
      const baseDmg = 14 + Math.floor(Math.random() * 8) + caster.damageBonus;
      const dmg = Math.floor(baseDmg * 0.7);
      const lines: string[] = [];
      for (const t of targets) {
        t.hp = Math.max(0, t.hp - dmg);
        const second = Math.random() < 0.4;
        if (second) t.hp = Math.max(0, t.hp - dmg);
        lines.push(`💨 **${t.name}**: -${second ? dmg * 2 : dmg}${second ? ' 💥×2' : ''}`);
      }
      return `💨 **${caster.name}** rozpętuje **Wir Żywiołów** (${dmg} AoE, 40% szans na drugi cios): ${lines.join(', ')}`;
    },
  },
};
