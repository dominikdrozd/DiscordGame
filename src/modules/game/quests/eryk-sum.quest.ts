import type { QuestDef } from './quest.js';

export const erykSum: QuestDef = {
  id: 'eryk_sum',
  name: 'Rybak Eryk: Sum Olbrzym',
  description:
    'Rybak Eryk w Oakhaven szuka odważnych — przynieś mu **5× Suma Olbrzyma**. Fishing lvl 18+.',
  giverNpcId: 'eryk',
  prerequisiteQuestIds: ['hela_szczupak'],
  turnInItem: { itemId: 'fish_sum', qty: 5 },
  reward: { gold: 600, xp: 350 },
};
