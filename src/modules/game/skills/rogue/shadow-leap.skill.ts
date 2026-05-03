import type { Skill } from '../index.js';
import { scaledBonus } from '../index.js';

export const skok_z_cienia: Skill = {
  id: 'skok_z_cienia',
  name: 'Skok z Cienia',
  description: 'Burst attack ×2 dmg z 50% szansą na bonus crit (subklasa Cień).',
  cooldown: 3,
  targeting: 'enemy',
  classes: ['cien'],
  scaling: { agi: 0.8, str: 0.4 },
  requirements: { level: 5, gold: 80, primary: { agi: 6 } },
  apply(_state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** próbuje skoku z cienia — bez celu.`;
    let dmg = (12 + Math.floor(Math.random() * 12) + caster.damageBonus + scaledBonus(caster, this.scaling)) * 2;
    const crit = Math.random() < 0.5;
    if (crit) dmg = Math.floor(dmg * 1.5);
    target.hp = Math.max(0, target.hp - dmg);
    return `🌑 **${caster.name}** wskakuje z cienia w **${target.name}** za **${dmg}** dmg${crit ? ' 💥 KRYT!' : ''}.`;
  },
};
