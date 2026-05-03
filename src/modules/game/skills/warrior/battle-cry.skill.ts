import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';

export const krzyk_bojowy: Skill = {
  id: 'krzyk_bojowy',
  name: 'Krzyk Bojowy',
  description: 'AoE taunt — wszyscy wrogowie celują w castera (subklasa Krzyżowiec).',
  cooldown: 4,
  targeting: 'self',
  classes: ['krzyzowiec'],
  requirements: { level: 5, gold: 80, primary: { wit: 4 } },
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
};
