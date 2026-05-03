import type { QuestDef } from './quest.js';

export const wraulDiamond: QuestDef = {
  id: 'wraul_diamond',
  name: 'Mistrz Diamentu',
  description:
    'Mistrz Wraul w Czarnej Cytadeli oczekuje **5× Diamentu** — esencji najgłębszych żył. Endgame chainu górniczego.',
  giverNpcId: 'wraul',
  prerequisiteQuestIds: ['grom_mithril'],
  turnInItem: { itemId: 'gem_diamond', qty: 5 },
  reward: { gold: 4000, xp: 2000, rewardItemId: 'sword_mithril' },
};
