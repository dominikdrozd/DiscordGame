import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Wraul extends Npc {
  readonly id = 'wraul';
  readonly name = 'Mistrz Diamentu Wraul';
  readonly description = 'Mistrz Cytadeli, znawca diamentów — stage 5 (endgame) chainu górniczego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '⛏️ **Wraul:** _Grom cię polecił? Hm. Tu nie ma rud — tu są **klejnoty**. Pokaż, że dasz radę._',
    stages: [
      {
        questId: 'wraul_diamond',
        displayLabel: 'Diamenty dla Wraula',
        offerText:
          '⛏️ **Wraul:** _Pięć sztuk **Diamentu**. Najgłębsze żyły, najbardziej wytrwali. Zwieńczenie chainu._',
        progressText: '⛏️ **Wraul:** _Diament pojawi się rzadko — pamiętaj o cierpliwości._',
        turnInText:
          '⛏️ **Wraul:** _Pięć diamentów w jednej dłoni. Zostałeś uznany **mistrzem górnictwa**._',
        referral: null,
      },
    ],
  });
}
