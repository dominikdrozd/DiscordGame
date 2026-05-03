import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const blood_vortex: Skill = {
  id: 'blood_vortex',
  name: 'Krwawa Otchłań',
  description: 'Lifesteal 25% przez 4 tury — każdy zadany cios leczy castera.',
  cooldown: 8,
  targeting: 'self',
  classes: [],
  universal: true,
  requirements: { level: 10, gold: 0, primary: { int: 5 } },
  apply(_state, caster) {
    addBuff(caster, {
      id: 'blood_vortex',
      kind: 'lifesteal',
      source: 'blood_vortex',
      ttl: 4,
      amount: 25,
    });
    return `🩸 **${caster.name}** wzywa **Krwawą Otchłań** — 25% lifesteal przez 4 tury.`;
  },
};
