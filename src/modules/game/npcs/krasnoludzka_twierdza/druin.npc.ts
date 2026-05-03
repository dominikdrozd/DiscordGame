import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Druin extends Npc {
  readonly id = 'druin';
  readonly name = 'Rybak Górski Druin';
  readonly description = 'Krasnoludzki rybak z górskich jezior — stage 4 chainu rybackiego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🎣 **Druin:** _Rybacy z dolin nie wiedzą, czym jest mróz na wodzie. Pokaż, że wiesz._',
    stages: [
      {
        questId: 'druin_marlin',
        displayLabel: 'Marliny dla Druina',
        offerText:
          '🎣 **Druin:** _Pięć sztuk **Marlina**. Fishing lvl 30+. Marlin walczy do końca._',
        progressText: '🎣 **Druin:** _Marlin szybki jak strzała — bądź szybszy._',
        turnInText: '🎣 **Druin:** _Marliny wagi w sam raz. Krasnolud uznaje twoją wytrwałość._',
        referral: { npcName: 'Łowca Krakena', cityName: 'Czarna Cytadela' },
      },
    ],
  });
}
