import { Npc } from '../npc.js';
import { ProfessionDialog } from '../profession-dialog.js';

export class Olek extends Npc {
  readonly id = 'olek';
  readonly name = 'Drwal Olek';
  readonly description = 'Drwal z portowej cieśli — startowy NPC chainu drwala (T1+T2).';
  readonly dialog = new ProfessionDialog({
    intro:
      '🪓 **Drwal Olek:** _O, Markowy uczeń. Pomóż mi z drewnem — pomost znów się rozsypuje._',
    stages: [
      {
        questId: 'olek_sosna',
        displayLabel: 'Sosna dla Olka',
        offerText: '🪓 **Olek:** _Pięć sztuk **Sosny** na deski. `/chop` lub Borys w Porcie._',
        progressText: '🪓 **Olek:** _Pochop, pochop — sosna leci szybko._',
        turnInText: '🪓 **Olek:** _Solidna sosna. Pomost stoi._',
      },
      {
        questId: 'olek_buk',
        displayLabel: 'Buk dla Olka',
        offerText:
          '🪓 **Olek:** _Teraz **5× Buka** — twardy, na belki. Woodcutting lvl 12+ lub kup u Olafa w Oakhaven._',
        progressText: '🪓 **Olek:** _Buk wymaga ostrej siekiery — chopuj._',
        turnInText: '🪓 **Olek:** _Piękny buk. Belki wytrzymają sztorm._',
        referral: { npcName: 'Drwal Borut', cityName: 'Oakhaven' },
      },
    ],
  });
}
