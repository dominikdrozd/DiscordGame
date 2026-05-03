import type { QuestDef } from './quest.js';

/**
 * Q2 — wybór rasy. Marek prosi gracza żeby zdecydował kim chce być.
 * Turn-in: gracz musi mieć ustawione `player.raceId` (sprawdzane w
 * dialogu Marka przez visibleIf, nie przez auto-mechanism).
 */
export const marekPickRace: QuestDef = {
  id: 'marek_pick_race',
  name: 'Krew i Pochodzenie',
  description:
    'Marek prosi cię żebyś zdecydował **kim jesteś**. Otwórz `/menu` → 🧬 Rasa, zobacz opisy i wybierz przez `/race pick id:<id>`. Wróć do Marka.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['first_steps'],
  autoCompleteIfHas: 'race',
  reward: {
    gold: 100,
    xp: 50,
  },
};
