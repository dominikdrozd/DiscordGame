import type { QuestDef } from './quest.js';

export const bartekSilver: QuestDef = {
  id: 'bartek_silver',
  name: 'Stary Górnik: Srebro',
  description:
    'Bartek prosi teraz o coś bardziej rzadkiego — **5× Rudy Srebra**. Trzeba wykopać w głębszych żyłach (mining lvl 12+) lub kupić w Oakhaven/Twierdzy.',
  giverNpcId: 'bartek',
  prerequisiteQuestIds: ['bartek_copper'],
  turnInItem: { itemId: 'ore_silver', qty: 5 },
  reward: { gold: 250, xp: 150, rewardItemId: 'potion_small' },
};
