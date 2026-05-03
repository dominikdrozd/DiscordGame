import type { QuestDef } from './quest.js';

export const helaSzczupak: QuestDef = {
  id: 'hela_szczupak',
  name: 'Babcia Hela: Szczupaki',
  description:
    'Hela podnosi poprzeczkę — **5× Szczupaka**. Fishing lvl 8+ lub zakup u Tomasza w Oakhaven.',
  giverNpcId: 'hela',
  prerequisiteQuestIds: ['hela_karp'],
  turnInItem: { itemId: 'fish_szczupak', qty: 5 },
  reward: { gold: 250, xp: 150, rewardItemId: 'potion_small' },
};
