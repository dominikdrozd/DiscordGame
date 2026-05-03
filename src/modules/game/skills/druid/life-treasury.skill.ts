import { createBuffSkill } from '../factory.js';

export const skarbnica_zycia = createBuffSkill({
  id: 'skarbnica_zycia',
  name: 'Skarbnica Życia',
  emoji: '🌳✨',
  description: 'AoE HoT 10/turę przez 4 tury na całą drużynę (tier-2 Drzewo Przodek).',
  cooldown: 6,
  targeting: 'allAllies',
  classes: ['drzewo_przodek'],
  scaling: { wit: 0.5, int: 0.5 },
  requirements: { level: 20, gold: 300, primary: { wit: 8, int: 8 } },
  kind: 'hot',
  baseAmount: 10,
  ttl: 4,
});
