import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';

export const oslepienie: Skill = {
  id: 'oslepienie',
  name: 'Oślepienie',
  description: 'Slow + -5 dmg debuff na 3 tury (tier-2 Szpieg).',
  cooldown: 4,
  targeting: 'enemy',
  classes: ['szpieg'],
  requirements: { level: 20, gold: 300, primary: { agi: 8, wit: 4 } },
  apply(_state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** sypie piaskiem — bez celu.`;
    addBuff(target, {
      id: 'oslepienie_slow',
      kind: 'slow',
      source: 'oslepienie',
      ttl: 1,
    });
    addBuff(target, {
      id: 'oslepienie_dmg',
      kind: 'damage_amp',
      source: 'oslepienie',
      ttl: 3,
      amount: -5,
    });
    return `🌫️ **${caster.name}** **oślepia** **${target.name}** — slow 1 turę + -5 dmg przez 3 tury.`;
  },
};
