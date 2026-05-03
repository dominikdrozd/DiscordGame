import type { Skill } from '../index.js';
import { scaledBonus } from '../index.js';

export const promien_slonca: Skill = {
  id: 'promien_slonca',
  name: 'Promień Słońca',
  description: 'Burst heal +50 HP na ally + cleanse 1 debuffa (tier-2 Słoneczny).',
  cooldown: 4,
  targeting: 'ally',
  classes: ['sloneczny'],
  scaling: { wit: 1.0, int: 1.2 },
  requirements: { level: 20, gold: 300, primary: { wit: 8, int: 10 } },
  apply(_state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** próbuje promień — bez celu.`;
    const heal = 50 + scaledBonus(caster, this.scaling);
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + heal);
    let cleansed = '';
    if (target.buffs && target.buffs.length > 0) {
      const debuffIdx = target.buffs.findIndex(
        (b) =>
          b.kind === 'dot' ||
          b.kind === 'slow' ||
          (b.kind === 'damage_amp' && (b.amount ?? 0) < 0),
      );
      if (debuffIdx >= 0) {
        const removed = target.buffs[debuffIdx];
        target.buffs.splice(debuffIdx, 1);
        cleansed = ` + cleanse **${removed.source}**`;
      }
    }
    return `☀️ **${caster.name}** rzuca **Promień Słońca** na **${target.name}** (+${target.hp - before} HP${cleansed}).`;
  },
};
