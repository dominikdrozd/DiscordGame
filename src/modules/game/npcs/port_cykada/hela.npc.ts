import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Hela extends Npc {
  readonly id = 'hela';
  readonly name = 'Babcia Hela';
  readonly description = 'Stara rybaczka z Portu — startowy NPC chainu rybackiego (T1+T2).';
  readonly dialog = new ProfessionDialog({
    intro:
      '🎣 **Babcia Hela:** _Hej, młody. Jak Marek już cię nauczył wędkarzyć, to przynieś mi parę ryb — gar już buzuje._',
    stages: [
      {
        questId: 'hela_karp',
        displayLabel: 'Karpie dla Heli',
        offerText: '🎣 **Hela:** _Pięć karpi na rosół. Łów w `/fish` albo kup u Borysa._',
        progressText: '🎣 **Hela:** _Karp lubi spokojną wodę — łów dalej._',
        turnInText: '🎣 **Hela:** _Tłuste karpie! Babcia będzie zadowolona._',
      },
      {
        questId: 'hela_szczupak',
        displayLabel: 'Szczupaki dla Heli',
        offerText:
          '🎣 **Hela:** _A teraz pięć **Szczupaków** — silne, mięsne. Fishing lvl 8+ albo zakup u Tomasza w Oakhaven._',
        progressText: '🎣 **Hela:** _Szczupak goni przynętę — łów cierpliwie._',
        turnInText: '🎣 **Hela:** _Świetne szczupaki. Wędzarnia rusza._',
        referral: { npcName: 'Rybak Eryk', cityName: 'Oakhaven' },
      },
    ],
  });
}
