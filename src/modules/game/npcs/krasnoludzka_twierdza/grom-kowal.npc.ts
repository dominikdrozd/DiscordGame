import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class GromKowal extends Npc {
  readonly id = 'grom_kowal';
  readonly name = 'Mistrz Grom Mithrilowiec';
  readonly description = 'Krasnoludzki mistrz mithrilu — stage 4 chainu górniczego.';
  readonly dialog = new ProfessionDialog({
    intro:
      '⛏️ **Mistrz Grom:** _Janosz cię polecił? Dobrze. Krasnoludy nie kopią dla zabawy. Mam wyzwanie._',
    stages: [
      {
        questId: 'grom_mithril',
        displayLabel: 'Mithril dla Mistrza',
        offerText:
          '⛏️ **Grom:** _Pięć sztuk **Rudy Mithrilu**. Mining lvl 35+. Mithril to dusza krasnoludzkiej kuźni._',
        progressText: '⛏️ **Grom:** _Mithril nie wybacza — kopaj precyzyjnie._',
        turnInText: '⛏️ **Grom:** _Czysty mithril. Ważysz tyle, co krasnolud z brodą._',
        referral: { npcName: 'Mistrz Diamentu Wraul', cityName: 'Czarna Cytadela' },
      },
    ],
  });
}
