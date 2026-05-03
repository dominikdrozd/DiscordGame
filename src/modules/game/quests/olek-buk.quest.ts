import type { QuestDef } from './quest.js';

export const olekBuk: QuestDef = {
  id: 'olek_buk',
  name: 'Drwal Olek: Buk',
  description:
    'Olek chce teraz **5× Buka** na solidne belki. Woodcutting lvl 12+ lub kupno w Oakhaven u Olafa.',
  giverNpcId: 'olek',
  prerequisiteQuestIds: ['olek_sosna'],
  turnInItem: { itemId: 'wood_buk', qty: 5 },
  reward: { gold: 250, xp: 150, rewardItemId: 'potion_small' },
};
