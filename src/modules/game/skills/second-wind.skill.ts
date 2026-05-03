import type { Skill } from './index.js';

export const second_wind: Skill = {
  id: 'second_wind',
  name: 'Drugie Oddech',
  description: 'Pełny heal HP + cleanse wszystkich debuffów.',
  cooldown: 9,
  targeting: 'self',
  classes: [],
  universal: true,
  requirements: { level: 15, gold: 0, primary: { wit: 10 } },
  apply(_state, caster) {
    const before = caster.hp;
    caster.hp = caster.maxHp;
    let cleansed = 0;
    if (caster.buffs && caster.buffs.length > 0) {
      const filtered = caster.buffs.filter(
        (b) =>
          b.kind !== 'dot' &&
          b.kind !== 'slow' &&
          !(b.kind === 'damage_amp' && (b.amount ?? 0) < 0),
      );
      cleansed = caster.buffs.length - filtered.length;
      caster.buffs = filtered;
    }
    return `💨 **${caster.name}** łapie **Drugie Oddech** (+${caster.hp - before} HP, cleanse ×${cleansed}).`;
  },
};
