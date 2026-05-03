import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';

export const taunt: Skill = {
  id: 'taunt',
  name: 'Prowokacja',
  description: 'Wymusza, że enemies wybierają cię jako cel w następnej turze (+threatBias).',
  cooldown: 3,
  targeting: 'self',
  classes: ['wojownik', 'berserker', 'krzyzowiec'],
  requirements: { level: 1, gold: 0 },
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
};
