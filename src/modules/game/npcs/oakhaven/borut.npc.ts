import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Borut extends Npc {
  readonly id = 'borut';
  readonly name = 'Drwal Borut';
  readonly description = 'Drwal z Lasu Hebanowego — stage 3 chainu drwala.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🪓 **Drwal Borut:** _Olek mówił o tobie. Tu nie chopuje się sosny — tu jest **heban**. Trzeba siekiery i mięśni._',
    stages: [
      {
        questId: 'borut_heban',
        displayLabel: 'Heban dla Boruta',
        offerText: '🪓 **Borut:** _Pięć sztuk **Hebanu**. Woodcutting lvl 22+. Ostra siekiera obowiązkowa._',
        progressText: '🪓 **Borut:** _Heban tępi siekiery — uważaj._',
        turnInText: '🪓 **Borut:** _Klasa drewna. Dziękuję._',
        referral: { npcName: 'Drwal Thordin', cityName: 'Krasnoludzka Twierdza' },
      },
    ],
  });
}
