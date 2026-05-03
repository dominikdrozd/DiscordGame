import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';
import { scaledBonus } from '../index.js';

export const paraliz: Skill = {
  id: 'paraliz',
  name: 'Paraliż',
  description: 'DoT 8/turę + slow przez 2 tury (tier-2 Mistrz Jadów).',
  cooldown: 4,
  targeting: 'enemy',
  classes: ['mistrz_jadow'],
  scaling: { int: 0.5, agi: 0.2 },
  requirements: { level: 20, gold: 300, primary: { int: 10 } },
  apply(_state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** próbuje paraliżu — bez celu.`;
    const dot = 8 + scaledBonus(caster, this.scaling);
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
};
