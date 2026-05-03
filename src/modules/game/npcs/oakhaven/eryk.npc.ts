import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Eryk extends Npc {
  readonly id = 'eryk';
  readonly name = 'Rybak Eryk';
  readonly description = 'Rybak z dębowych jezior Oakhaven — stage 3 chainu rybackiego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🎣 **Rybak Eryk:** _Babcia Hela polecała? Świetnie. Tu mamy większe ryby — ale i większe ryzyko._',
    stages: [
      {
        questId: 'eryk_sum',
        displayLabel: 'Sumy dla Eryka',
        offerText:
          '🎣 **Eryk:** _Pięć sztuk **Suma Olbrzyma**. Fishing lvl 18+ — sumy chodzą głębiej._',
        progressText: '🎣 **Eryk:** _Sum wytrzymały — ciągnij twardo._',
        turnInText: '🎣 **Eryk:** _Te sumy starczą na cały tydzień. Dziękuję._',
        referral: { npcName: 'Rybak Górski Druin', cityName: 'Krasnoludzka Twierdza' },
      },
    ],
  });
}
