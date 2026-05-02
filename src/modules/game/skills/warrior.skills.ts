import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';
import { applyAttack } from '../engine/combat.js';

export const WARRIOR_SKILLS: Record<string, Skill> = {
  taunt: {
    id: 'taunt',
    name: 'Prowokacja',
    description: 'Wymusza, że enemies wybierają cię jako cel w następnej turze (+threatBias).',
    cooldown: 3,
    targeting: 'self',
    classes: ['wojownik', 'berserker', 'krzyzowiec'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'taunt',
        kind: 'taunt',
        source: 'taunt',
        ttl: 1,
        casterId: caster.id,
      });
      caster.threatBias = (caster.threatBias ?? 0) + 2;
      return `🎯 **${caster.name}** rzuca **Prowokację** — wszyscy wrogowie się gotują żeby walnąć właśnie w niego.`;
    },
  },
  tarcza_jelita: {
    id: 'tarcza_jelita',
    name: 'Tarcza Jelita',
    description: '+5 do obrony na 2 tury.',
    cooldown: 2,
    targeting: 'self',
    classes: ['wojownik', 'berserker', 'krzyzowiec'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'tarcza_jelita',
        kind: 'defense_amp',
        source: 'tarcza_jelita',
        ttl: 2,
        amount: 5,
      });
      return `🛡️ **${caster.name}** napina jelita — +5 def przez 2 tury.`;
    },
  },
  szal: {
    id: 'szal',
    name: 'Szał Berserkera',
    description: '+8 dmg na 2 tury (subklasa Berserker).',
    cooldown: 4,
    targeting: 'self',
    classes: ['berserker'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'szal',
        kind: 'damage_amp',
        source: 'szal',
        ttl: 2,
        amount: 8,
      });
      return `🔥 **${caster.name}** wpada w **szał** — +8 dmg przez 2 tury.`;
    },
  },
  krzyk_bojowy: {
    id: 'krzyk_bojowy',
    name: 'Krzyk Bojowy',
    description: 'AoE taunt — wszyscy wrogowie celują w castera (subklasa Krzyżowiec).',
    cooldown: 4,
    targeting: 'self',
    classes: ['krzyzowiec'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'krzyk_bojowy',
        kind: 'taunt',
        source: 'krzyk_bojowy',
        ttl: 2,
        casterId: caster.id,
      });
      caster.threatBias = (caster.threatBias ?? 0) + 4;
      return `📣 **${caster.name}** wydaje **Krzyk Bojowy** — wszyscy wrogowie wpadają w furię (taunt 2 tury).`;
    },
  },
  odbicie: {
    id: 'odbicie',
    name: 'Odbicie',
    description: '+10 def na 1 turę (subklasa Krzyżowiec).',
    cooldown: 3,
    targeting: 'self',
    classes: ['krzyzowiec'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'odbicie',
        kind: 'defense_amp',
        source: 'odbicie',
        ttl: 1,
        amount: 10,
      });
      return `🪞 **${caster.name}** wystawia **Odbicie** — +10 def na 1 turę.`;
    },
  },
  // ── TIER 2 ────────────────────────────────────────
  furia: {
    id: 'furia',
    name: 'Furia Krwi',
    description: 'Self buff +12 dmg przez 3 tury (tier-2 Krwawnik).',
    cooldown: 5,
    targeting: 'self',
    classes: ['krwawnik'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'furia',
        kind: 'damage_amp',
        source: 'furia',
        ttl: 3,
        amount: 12,
      });
      return `🩸 **${caster.name}** wpada w **Furię Krwi** — +12 dmg przez 3 tury.`;
    },
  },
  pohuk: {
    id: 'pohuk',
    name: 'Pohuk Mistrza',
    description: 'Mocny taunt na 3 tury + self +6 def przez 2 tury (tier-2 Wodzowy Rzeźnik).',
    cooldown: 5,
    targeting: 'self',
    classes: ['wodzowy_rzeznik'],
    apply(_state, caster) {
      addBuff(caster, {
        id: 'pohuk',
        kind: 'taunt',
        source: 'pohuk',
        ttl: 3,
        casterId: caster.id,
      });
      addBuff(caster, {
        id: 'pohuk_def',
        kind: 'defense_amp',
        source: 'pohuk',
        ttl: 2,
        amount: 6,
      });
      caster.threatBias = (caster.threatBias ?? 0) + 6;
      return `📢 **${caster.name}** wydaje **Pohuk Mistrza** — wszyscy wrogowie celują w niego (3 tury) i +6 def (2 tury).`;
    },
  },
  bizmut: {
    id: 'bizmut',
    name: 'Bizmutowe Błogosławieństwo',
    description: '+35 HP heal na ally (skaluje z WIT, tier-2 Święty Strażak).',
    cooldown: 3,
    targeting: 'ally',
    classes: ['swiety_strazak'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** próbuje błogosławić — bez celu.`;
      const heal = 35 + Math.floor((caster.spellPower ?? 0) * 0.8);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return `💊 **${caster.name}** kładzie **Bizmutowe Błogosławieństwo** na **${target.name}** (+${target.hp - before} HP).`;
    },
  },
  mlot_swiety: {
    id: 'mlot_swiety',
    name: 'Święty Młot',
    description: 'Atak ×1.8 dmg ignorujący 50% obrony (tier-2 Gniew Boży).',
    cooldown: 4,
    targeting: 'enemy',
    classes: ['gniew_bozy'],
    apply(_state, caster, targets) {
      const target = targets[0];
      if (!target) return `**${caster.name}** unosi święty młot — ale bez celu.`;
      const base = 14 + Math.floor(Math.random() * 12) + caster.damageBonus;
      const dmg = Math.floor(base * 1.8);
      target.hp = Math.max(0, target.hp - dmg);
      return `🔨✨ **${caster.name}** uderza **Świętym Młotem** w **${target.name}** za **${dmg}** dmg (ignoruje połowę obrony).`;
    },
  },
};
