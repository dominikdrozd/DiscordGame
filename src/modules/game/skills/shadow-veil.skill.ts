import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';

export const shadow_veil: Skill = {
  id: 'shadow_veil',
  name: 'Cień Iluzji',
  description: '+50% szansa uniku przez 3 tury.',
  cooldown: 7,
  targeting: 'self',
  classes: [],
  universal: true,
  requirements: { level: 12, gold: 0, primary: { agi: 10 } },
  apply(_state, caster) {
    addBuff(caster, {
      id: 'shadow_veil',
      kind: 'evasion',
      source: 'shadow_veil',
      ttl: 3,
      amount: 50,
    });
    return `🌑 **${caster.name}** zarzuca **Cień Iluzji** — +50% uniku przez 3 tury.`;
  },
};
