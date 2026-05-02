import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const CLERIC_SKILLS: Record<string, Skill> = {
  swiate_uzdrowienie: {
    id: 'swiate_uzdrowienie',
    name: 'Świątek Uzdrowienia',
    description: '+30 HP do ally (skaluje z INT × 1.5).',
    cooldown: 2,
    targeting: 'ally',
    classes: ['klecha', 'inkwizytor', 'swietomat'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje uzdrowienia — bez celu.`;
      const heal = 30 + Math.floor((caster.spellPower ?? 0) * 1.5);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return `✨ **${caster.name}** rzuca **Świątek Uzdrowienia** na **${target.name}** (+${target.hp - before} HP).`;
    },
  },
  tarcza_wiary: {
    id: 'tarcza_wiary',
    name: 'Tarcza Wiary',
    description: 'Tarcza pochłaniająca 25 dmg (skaluje z INT) na ally.',
    cooldown: 3,
    targeting: 'ally',
    classes: ['klecha', 'inkwizytor', 'swietomat'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje tarczy — bez celu.`;
      const amount = 25 + Math.floor((caster.spellPower ?? 0) * 1.0);
      addBuff(target, {
        id: 'tarcza_wiary',
        kind: 'shield',
        source: 'tarcza_wiary',
        ttl: 3,
        amount,
      });
      return `🛡️✨ **${caster.name}** otacza **${target.name}** **Tarczą Wiary** (pochłonie ${amount} dmg).`;
    },
  },
  osad_kacerza: {
    id: 'osad_kacerza',
    name: 'Osąd Kacerza',
    description: 'Single-target dmg + osłabienie -3 dmg na 2 tury (subklasa Inkwizytor).',
    cooldown: 3,
    targeting: 'enemy',
    classes: ['inkwizytor'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje osądu — bez celu.`;
      const dmg = 12 + Math.floor(Math.random() * 8) + (caster.spellPower ?? 0);
      target.hp = Math.max(0, target.hp - dmg);
      addBuff(target, {
        id: 'osad_kacerza',
        kind: 'damage_amp',
        source: 'osad_kacerza',
        ttl: 2,
        amount: -3,
      });
      return `⚖️ **${caster.name}** rzuca **Osąd Kacerza** w **${target.name}** za **${dmg}** dmg + -3 dmg debuff (2 tury).`;
    },
  },
  ozyw: {
    id: 'ozyw',
    name: 'Ożyw',
    description: 'Wskrzesza padłego ally z 50% HP (subklasa Świętomat, raz na walkę).',
    cooldown: 99,
    targeting: 'ally',
    classes: ['swietomat'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje wskrzeszenia — bez celu.`;
      if (target.hp > 0) {
        target.hp = Math.min(target.maxHp, target.hp + 30);
        return `✨ **${caster.name}** dotyka **${target.name}** świętym dotykiem (+30 HP, ale cel żyje).`;
      }
      target.hp = Math.floor(target.maxHp * 0.5);
      return `⚱️ **${caster.name}** **OŻYWIA** **${target.name}** z ${target.hp} HP!`;
    },
  },
  // ── TIER 2 ────────────────────────────────────────
  swiety_mlot: {
    id: 'swiety_mlot',
    name: 'Święty Młot Inkwizycji',
    description: 'Single dmg + -5 dmg debuff przez 3 tury (tier-2 Młot Kacerski).',
    cooldown: 4,
    targeting: 'enemy',
    classes: ['mlot_kacerski'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** unosi święty młot — bez celu.`;
      const dmg = 18 + Math.floor(Math.random() * 10) + (caster.spellPower ?? 0);
      target.hp = Math.max(0, target.hp - dmg);
      addBuff(target, {
        id: 'swiety_mlot_debuff',
        kind: 'damage_amp',
        source: 'swiety_mlot',
        ttl: 3,
        amount: -5,
      });
      return `🔨✨ **${caster.name}** wymierza **Święty Młot** w **${target.name}** za **${dmg}** dmg + -5 dmg debuff (3 tury).`;
    },
  },
  osad: {
    id: 'osad',
    name: 'Osąd Ostateczny',
    description: 'AoE -3 dmg debuff + DoT 4/turę 2 tury na wszystkich wrogów (tier-2 Kaźń).',
    cooldown: 5,
    targeting: 'allEnemies',
    classes: ['kazn'],
    apply(_state, caster, targets) {
      for (const t of targets) {
        addBuff(t, {
          id: 'osad_debuff',
          kind: 'damage_amp',
          source: 'osad',
          ttl: 3,
          amount: -3,
        });
        addBuff(t, {
          id: 'osad_dot',
          kind: 'dot',
          source: 'osad',
          ttl: 2,
          amount: 4,
        });
      }
      return `⚖️🔥 **${caster.name}** wykonuje **Osąd Ostateczny** — wszyscy wrogowie -3 dmg (3 tury) + 4 dmg/turę.`;
    },
  },
  gloria: {
    id: 'gloria',
    name: 'Gloria',
    description: 'AoE HoT 8/turę 3 tury na wszystkich ally (tier-2 Arcyeasey).',
    cooldown: 5,
    targeting: 'allAllies',
    classes: ['arcyeasey'],
    apply(_state, caster, targets) {
      const heal = 8 + Math.floor((caster.spellPower ?? 0) * 0.4);
      for (const t of targets) {
        addBuff(t, {
          id: 'gloria',
          kind: 'hot',
          source: 'gloria',
          ttl: 3,
          amount: heal,
        });
      }
      return `🌟 **${caster.name}** rzuca **Glorię** — wszyscy ally regenerują +${heal} HP/turę przez 3 tury.`;
    },
  },
  chor_aniolow: {
    id: 'chor_aniolow',
    name: 'Chór Aniołów',
    description: 'AoE +20 HP heal + +5 def 2 tury na wszystkich ally (tier-2 Słudzy Świętości).',
    cooldown: 5,
    targeting: 'allAllies',
    classes: ['slugi_swietosci'],
    apply(_state, caster, targets) {
      const heal = 20 + Math.floor((caster.spellPower ?? 0) * 0.6);
      const lines: string[] = [];
      for (const t of targets) {
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + heal);
        addBuff(t, {
          id: 'chor_aniolow_def',
          kind: 'defense_amp',
          source: 'chor_aniolow',
          ttl: 2,
          amount: 5,
        });
        lines.push(`👼 **${t.name}**: +${t.hp - before} HP`);
      }
      return `👼✨ **${caster.name}** wzywa **Chór Aniołów** (+5 def 2 tury): ${lines.join(', ')}`;
    },
  },
};
