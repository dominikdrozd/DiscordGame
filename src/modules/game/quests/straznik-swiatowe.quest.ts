import type { QuestDef } from './quest.js';

export const straznikSwiatowe: QuestDef = {
  id: 'straznik_swiatowe',
  name: 'Strażnik Drzewa Świata',
  description:
    'Strażnik w Czarnej Cytadeli żąda **5× Drewna z Drzewa Świata**. Woodcutting lvl 50+. Endgame chainu drwala.',
  giverNpcId: 'straznik_drzewa',
  prerequisiteQuestIds: ['thordin_smoczy'],
  turnInItem: { itemId: 'wood_swiatowe', qty: 5 },
  reward: { gold: 4000, xp: 2000, rewardItemId: 'sword_mithril' },
};
