import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Bartek extends Npc {
  readonly id = 'bartek';
  readonly name = 'Stary Górnik Bartek';
  readonly description = 'Weteran portowej kopalni — startowy NPC chainu górniczego (T1+T2).';
  readonly dialog = new ProfessionDialog({
    intro:
      '⛏️ **Stary Bartek:** _Słyszałem, że Marek już cię puścił w świat. Świetnie — kopalnia ciągle rzęzi, a ja sam już nie zejdę. Przynieś mi rudę, pokażę ci coś o niej._',
    stages: [
      {
        questId: 'bartek_copper',
        displayLabel: 'Miedź dla Bartka',
        offerText:
          '⛏️ **Bartek:** _Najpierw miedź — podstawa wszystkiego. Wykop pięć sztuk i wracaj._',
        progressText: '⛏️ **Bartek:** _Kopaj dalej — w `/mine` z każdym wykopiskiem masz szanse._',
        turnInText: '⛏️ **Bartek:** _Świetna ruda. Czysta miedź — nieczęsto teraz taka leci._',
      },
      {
        questId: 'bartek_silver',
        displayLabel: 'Srebro dla Bartka',
        offerText:
          '⛏️ **Bartek:** _Teraz coś trudniejszego — pięć sztuk **Rudy Srebra**. W Porcie srebra nie ma, w głębszych żyłach (mining lvl 12+) lub kup w Oakhaven._',
        progressText: '⛏️ **Bartek:** _Srebro nie leci ot tak — kopaj głębiej albo idź na targ._',
        turnInText:
          '⛏️ **Bartek:** _Piękne srebro. Już wiem, że dasz radę nawet w Cytadeli — ale to później._',
        referral: { npcName: 'Sztygar Janosz', cityName: 'Oakhaven' },
      },
    ],
  });
}
