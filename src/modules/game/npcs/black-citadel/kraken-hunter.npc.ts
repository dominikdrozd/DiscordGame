import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class KrakenHunter extends Npc {
  readonly id = 'lowca_krakena';
  readonly name = 'Łowca Krakena';
  readonly description = 'Mityczny rybak Cytadeli — stage 5 (endgame) chainu rybackiego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🎣 **Łowca:** _Druin cię polecił? To znaczy, że masz odwagę. Tu jest tylko jeden test — kraken._',
    stages: [
      {
        questId: 'lowca_kraken',
        displayLabel: 'Krakeny dla Łowcy',
        offerText:
          '🎣 **Łowca:** _Pięć sztuk **Małego Krakena**. Fishing lvl 50+. Tylko najlepsi wracają z brzegu._',
        progressText: '🎣 **Łowca:** _Kraken pojawia się raz na sto rzutów. Wytrwałość._',
        turnInText:
          '🎣 **Łowca:** _Pięć krakenów! Zostałeś uznany **mistrzem rybołówstwa** Cytadeli._',
        referral: null,
      },
    ],
  });
}
