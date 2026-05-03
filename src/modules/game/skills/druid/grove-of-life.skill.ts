import { createBuffSkill } from '../factory.js';

export const gaj_zycia = createBuffSkill({
  id: 'gaj_zycia',
  name: 'Gaj Życia',
  emoji: '🌳',
  description: 'AoE HoT 6 hp/tura przez 3 tury na całą drużynę (subklasa Korzennik).',
  cooldown: 5,
  targeting: 'allAllies',
  classes: ['korzennik'],
  scaling: { wit: 0.3, int: 0.3 },
  requirements: { level: 5, gold: 80, primary: { wit: 4, int: 4 } },
  kind: 'hot',
  baseAmount: 6,
  ttl: 3,
});
