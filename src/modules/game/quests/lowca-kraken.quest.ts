import type { QuestDef } from './quest.js';

export const lowcaKraken: QuestDef = {
  id: 'lowca_kraken',
  name: 'Łowca Krakena',
  description:
    'Łowca w Czarnej Cytadeli rzuca ostatnie wyzwanie — **5× Małego Krakena**. Fishing lvl 50+. Endgame chainu rybackiego.',
  giverNpcId: 'lowca_krakena',
  prerequisiteQuestIds: ['druin_marlin'],
  turnInItem: { itemId: 'fish_kraken', qty: 5 },
  reward: { gold: 4000, xp: 2000, rewardItemId: 'sword_mithril' },
};
