import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';
import { scaledBonus } from '../index.js';

export const chor_aniolow: Skill = {
  id: 'chor_aniolow',
  name: 'Chór Aniołów',
  description: 'AoE +20 HP heal + +5 def 2 tury na wszystkich ally (tier-2 Słudzy Świętości).',
  cooldown: 5,
  targeting: 'allAllies',
  classes: ['slugi_swietosci'],
  scaling: { wit: 0.6, int: 0.6 },
  requirements: { level: 20, gold: 300, primary: { wit: 12, int: 8 } },
  apply(_state, caster, targets) {
    const heal = 20 + scaledBonus(caster, this.scaling);
    const lines: string[] = [];
    for (const t of targets) {
      const before = t.hp;
      t.hp = Math.min(t.maxHp, t.hp + heal);
      addBuff(t, {
        id: 'chor_aniolow_def',
        kind: 'defense_amp',
        source: 'chor_aniolow',
        ttl: 2,
        amount: 5,
      });
      lines.push(`👼 **${t.name}**: +${t.hp - before} HP`);
    }
    return `👼✨ **${caster.name}** wzywa **Chór Aniołów** (+5 def 2 tury): ${lines.join(', ')}`;
  },
};
