import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';
import { scaledBonus } from '../index.js';

export const mgla_lodu: Skill = {
  id: 'mgla_lodu',
  name: 'Mgła Lodu',
  description: 'AoE slow 2 tury + DoT 3/turę na wszystkich wrogów (tier-2 Sługa Śmietli).',
  cooldown: 5,
  targeting: 'allEnemies',
  classes: ['sluga_smietli'],
  scaling: { int: 0.3 },
  requirements: { level: 20, gold: 300, primary: { int: 8 } },
  apply(_state, caster, targets) {
    const amount = 3 + scaledBonus(caster, this.scaling);
    for (const t of targets) {
      addBuff(t, {
        id: 'mgla_lodu_slow',
        kind: 'slow',
        source: 'mgla_lodu',
        ttl: 2,
      });
      addBuff(t, {
        id: 'mgla_lodu_dot',
        kind: 'dot',
        source: 'mgla_lodu',
        ttl: 3,
        amount,
      });
    }
    return `❄️🌫️ **${caster.name}** rozpuszcza **Mgłę Lodu** — wszyscy wrogowie spowolnieni (2 tury) i ${amount} dmg/turę.`;
  },
};
