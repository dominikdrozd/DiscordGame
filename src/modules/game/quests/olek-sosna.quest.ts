import type { QuestDef } from './quest.js';

export const olekSosna: QuestDef = {
  id: 'olek_sosna',
  name: 'Drwal Olek: Sosna',
  description:
    'Drwal Olek z Portu Cykada chce **5× Sosny** na nowy pomost. Pochop w `/chop` lub kup u Borysa.',
  giverNpcId: 'olek',
  prerequisiteQuestIds: ['marek_duel'],
  turnInItem: { itemId: 'wood_sosna', qty: 5 },
  reward: { gold: 100, xp: 60 },
};
