import type { Skill } from './index.js';

export const saviors_grace: Skill = {
  id: 'saviors_grace',
  name: 'Łaska Zbawcy',
  description: 'AoE pełny heal HP wszystkim sojusznikom.',
  cooldown: 9,
  targeting: 'allAllies',
  classes: [],
  universal: true,
  requirements: { level: 25, gold: 0, primary: { wit: 20, int: 15 } },
  apply(_state, caster, targets) {
    const lines: string[] = [];
    for (const t of targets) {
      const before = t.hp;
      t.hp = t.maxHp;
      lines.push(`👼 **${t.name}**: +${t.hp - before} HP`);
    }
    return `🕊️ **${caster.name}** rozlewa **Łaskę Zbawcy** — wszyscy ally w pełni uleczeni: ${lines.join(', ')}`;
  },
};
