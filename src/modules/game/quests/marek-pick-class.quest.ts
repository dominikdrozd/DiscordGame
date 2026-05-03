import type { QuestDef } from './quest.js';

/**
 * Q3 — wybór klasy. Po wyborze rasy Marek pyta o specjalizację bojową.
 * Turn-in: gracz musi mieć ustawione `player.classId`.
 */
export const marekPickClass: QuestDef = {
  id: 'marek_pick_class',
  name: 'Ścieżka Wojownika',
  description:
    'Marek prosi cię żebyś wybrał **klasę bojową**. Otwórz `/menu` → ⚔️ Klasa i wybierz przez `/class pick id:<id>`. Każda klasa ma inne skille startowe + bonus speed.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_pick_race'],
  autoCompleteIfHas: 'class',
  reward: {
    gold: 150,
    xp: 75,
  },
};
