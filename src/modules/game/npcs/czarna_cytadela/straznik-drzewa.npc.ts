import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class StraznikDrzewa extends Npc {
  readonly id = 'straznik_drzewa';
  readonly name = 'Strażnik Drzewa Świata';
  readonly description = 'Tajemniczy strażnik z Cytadeli — stage 5 (endgame) chainu drwala.';
  readonly dialog = new ProfessionDialog({
    intro:
      '🪓 **Strażnik:** _Thordin cię przysłał. Drzewo Świata żyje. Aby z niego ściąć — trzeba wiedzieć._',
    stages: [
      {
        questId: 'straznik_swiatowe',
        displayLabel: 'Drewno z Drzewa Świata',
        offerText:
          '🪓 **Strażnik:** _Pięć sztuk **Drewna z Drzewa Świata**. Woodcutting lvl 50+. Tylko z najgłębszego serca lasu._',
        progressText: '🪓 **Strażnik:** _Drzewo Świata rośnie powoli — powoli też je rąb._',
        turnInText:
          '🪓 **Strażnik:** _Pięć kawałków serca lasu. Zostałeś uznany **mistrzem leśnictwa** Cytadeli._',
        referral: null,
      },
    ],
  });
}
