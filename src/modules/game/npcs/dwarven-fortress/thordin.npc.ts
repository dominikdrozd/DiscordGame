import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Thordin extends Npc {
  readonly id = 'thordin';
  readonly name = 'Drwal Thordin';
  readonly description = 'Krasnoludzki cieśla wrót Twierdzy — stage 4 chainu drwala.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🪓 **Thordin:** _Borut polecał? Tutaj rąbiemy drewno smocze — stara robota, dobra zapłata._',
    stages: [
      {
        questId: 'thordin_smoczy',
        displayLabel: 'Smocze Drewno dla Thordina',
        offerText:
          '🪓 **Thordin:** _Pięć sztuk **Drewna Smoczego Dębu**. Woodcutting lvl 35+. Drewno do bramy podziemia._',
        progressText: '🪓 **Thordin:** _Smoczy dąb pali siekierę — chłodź ostrze._',
        turnInText: '🪓 **Thordin:** _Drewno godne wrót Twierdzy. Krasnoludy będą pamiętać._',
        referral: { npcName: 'Strażnik Drzewa Świata', cityName: 'Czarna Cytadela' },
      },
    ],
  });
}
