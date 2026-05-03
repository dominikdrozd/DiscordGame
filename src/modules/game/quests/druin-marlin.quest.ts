import type { QuestDef } from './quest.js';

export const druinMarlin: QuestDef = {
  id: 'druin_marlin',
  name: 'Druin: Marliny z górskich jezior',
  description:
    'Krasnolud Druin w Twierdzy nie ufa rybakom z dolin. Przynieś mu **5× Marlina**. Fishing lvl 30+.',
  giverNpcId: 'druin',
  prerequisiteQuestIds: ['eryk_sum'],
  turnInItem: { itemId: 'fish_marlin', qty: 5 },
  reward: { gold: 1500, xp: 800, rewardItemId: 'potion_small' },
};
