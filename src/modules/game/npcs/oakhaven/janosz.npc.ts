import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Janosz extends Npc {
  readonly id = 'janosz';
  readonly name = 'Sztygar Janosz';
  readonly description = 'Sztygar oakhaweńskich kopalń — stage 3 chainu górniczego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '⛏️ **Sztygar Janosz:** _Bartek cię przysłał? Hm, w sam raz. Mam robotę dla kogoś z kilofem._',
    stages: [
      {
        questId: 'janosz_gold',
        displayLabel: 'Złoto dla Janosza',
        offerText:
          '⛏️ **Janosz:** _Pięć sztuk **Rudy Złota**. Mining lvl 20+, albo idź do Mistrza Groma w Twierdzy — tam handlują._',
        progressText: '⛏️ **Janosz:** _Złoto się rzadko trafia — kopaj cierpliwie._',
        turnInText: '⛏️ **Janosz:** _Czyste złoto. Spuszczam je do mennicy._',
        referral: { npcName: 'Mistrz Grom Mithrilowiec', cityName: 'Krasnoludzka Twierdza' },
      },
    ],
  });
}
