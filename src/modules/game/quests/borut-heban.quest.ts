import type { QuestDef } from './quest.js';

export const borutHeban: QuestDef = {
  id: 'borut_heban',
  name: 'Drwal Borut: Heban',
  description:
    'Borut z Oakhaven testuje twoją siekierę — **5× Hebanu**. Woodcutting lvl 22+.',
  giverNpcId: 'borut',
  prerequisiteQuestIds: ['olek_buk'],
  turnInItem: { itemId: 'wood_heban', qty: 5 },
  reward: { gold: 600, xp: 350 },
};
