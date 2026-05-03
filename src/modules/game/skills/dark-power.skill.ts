import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';
import { scaledBonus } from './index.js';

export const dark_power: Skill = {
  id: 'dark_power',
  name: 'Klucz Mrocznej Mocy',
  description: '+20 dmg + +25% crit przez 5 tur.',
  cooldown: 8,
  targeting: 'self',
  classes: [],
  universal: true,
  scaling: { str: 0.5, int: 0.5 },
  requirements: { level: 20, gold: 0, primary: { str: 15, int: 10 } },
  apply(_state, caster) {
    const dmg = 20 + scaledBonus(caster, this.scaling);
    addBuff(caster, {
      id: 'dark_power_dmg',
      kind: 'damage_amp',
      source: 'dark_power',
      ttl: 5,
      amount: dmg,
    });
    addBuff(caster, {
      id: 'dark_power_crit',
      kind: 'crit_amp',
      source: 'dark_power',
      ttl: 5,
      amount: 25,
    });
    return `🖤 **${caster.name}** sięga po **Klucz Mrocznej Mocy** — +${dmg} dmg + +25% crit przez 5 tur.`;
  },
};
