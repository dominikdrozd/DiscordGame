import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';
import { scaledBonus } from '../index.js';

export const osad: Skill = {
  id: 'osad',
  name: 'Osąd Ostateczny',
  description: 'AoE -3 dmg debuff + DoT 4/turę 2 tury na wszystkich wrogów (tier-2 Kaźń).',
  cooldown: 5,
  targeting: 'allEnemies',
  classes: ['kazn'],
  scaling: { int: 0.3 },
  requirements: { level: 20, gold: 300, primary: { int: 12 } },
  apply(_state, caster, targets) {
    const dot = 4 + scaledBonus(caster, this.scaling);
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
        amount: dot,
      });
    }
    return `⚖️🔥 **${caster.name}** wykonuje **Osąd Ostateczny** — wszyscy wrogowie -3 dmg (3 tury) + ${dot} dmg/turę.`;
  },
};
