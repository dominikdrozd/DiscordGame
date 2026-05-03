import type { QuestDef } from './quest.js';

export const janoszGold: QuestDef = {
  id: 'janosz_gold',
  name: 'Sztygar Janosz: Złoto',
  description:
    'Sztygar Janosz w Oakhaven chce **5× Rudy Złota**. Mining lvl 20+ lub zakup u Mistrza Groma w Twierdzy.',
  giverNpcId: 'janosz',
  prerequisiteQuestIds: ['bartek_silver'],
  turnInItem: { itemId: 'ore_gold', qty: 5 },
  reward: { gold: 600, xp: 350 },
};
