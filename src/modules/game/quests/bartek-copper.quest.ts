import type { QuestDef } from './quest.js';

export const bartekCopper: QuestDef = {
  id: 'bartek_copper',
  name: 'Stary Górnik: Miedź',
  description:
    'Stary Bartek z Portu Cykada potrzebuje **5× Rudy Miedzi**. Wykop w `/mine` lub kup u Witolda.',
  giverNpcId: 'bartek',
  prerequisiteQuestIds: ['marek_duel'],
  turnInItem: { itemId: 'ore_copper', qty: 5 },
  reward: { gold: 100, xp: 60 },
};
