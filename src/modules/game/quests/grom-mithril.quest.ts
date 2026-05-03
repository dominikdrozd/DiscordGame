import type { QuestDef } from './quest.js';

export const gromMithril: QuestDef = {
  id: 'grom_mithril',
  name: 'Mistrz Mithrilu',
  description:
    'Mistrz Grom w Krasnoludzkiej Twierdzy żąda **5× Rudy Mithrilu** — najlepszego materiału krasnoludzkich kuźni. Mining lvl 35+.',
  giverNpcId: 'grom_kowal',
  prerequisiteQuestIds: ['janosz_gold'],
  turnInItem: { itemId: 'ore_mithril', qty: 5 },
  reward: { gold: 1500, xp: 800, rewardItemId: 'potion_small' },
};
