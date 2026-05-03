import type { Skill } from '../index.js';
import { scaledBonus } from '../index.js';

export const wir: Skill = {
  id: 'wir',
  name: 'Wir Żywiołów',
  description: 'AoE dmg ×0.7 + szansa na drugi cios przy każdym wrogu (tier-2 Żywioł).',
  cooldown: 4,
  targeting: 'allEnemies',
  classes: ['zywiol'],
  scaling: { agi: 0.7, int: 0.4 },
  requirements: { level: 20, gold: 300, primary: { agi: 10 } },
  apply(_state, caster, targets) {
    const baseDmg = 14 + Math.floor(Math.random() * 8) + caster.damageBonus + scaledBonus(caster, this.scaling);
    const dmg = Math.floor(baseDmg * 0.7);
    const lines: string[] = [];
    for (const t of targets) {
      t.hp = Math.max(0, t.hp - dmg);
      const second = Math.random() < 0.4;
      if (second) t.hp = Math.max(0, t.hp - dmg);
      lines.push(`💨 **${t.name}**: -${second ? dmg * 2 : dmg}${second ? ' 💥×2' : ''}`);
    }
    return `💨 **${caster.name}** rozpętuje **Wir Żywiołów** (${dmg} AoE, 40% szans na drugi cios): ${lines.join(', ')}`;
  },
};
