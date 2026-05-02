import { Dialog, type DialogNode, Npc } from '../npc.js';

class MarekDialog extends Dialog {
  readonly startNodeId = 'intro';
  readonly nodes: Readonly<Record<string, DialogNode>> = {
    intro: {
      text:
        '🧔 **Stary Marek:** _Ej, podróżniku — nowa twarz w Porcie Cykada, co?_\n' +
        'Mów wprost, czego ci trzeba — czas to złoto, a fala nie czeka.',
      options: [
        { label: 'Opowiedz mi o mieście', goto: 'about_city' },
        { label: 'Co dalej za horyzontem?', goto: 'about_world' },
        { label: 'Skąd ty się tu wziąłeś?', goto: 'about_marek' },
        { label: 'Już nic. Bywaj.', goto: 'end' },
      ],
    },
    about_city: {
      text:
        '🧔 **Marek:** _Port Cykada to brama Quelthasee. Każdy szczur lądowy zaczyna tu — ' +
        'rybacy nakarmią, górnicy uzbroją, alchemiczka Mira pomoże nie zdechnąć w pierwszej ' +
        'tarapacie. Wpadnij do sklepu, zanim ruszysz głębiej w region._',
      options: [
        { label: 'A co z ekspedycjami?', goto: 'about_world' },
        { label: 'Powrót', goto: 'intro' },
        { label: 'Dziękuję, do zobaczenia.', goto: 'end' },
      ],
    },
    about_world: {
      text:
        '🧔 **Marek:** _Quelthasee dzieli się na cztery regiony — od cichych zatok po Czarną ' +
        'Cytadelę na północy. Każdy następny region wymaga twardszej skóry. Trzymaj się ' +
        'pierwszego, póki combat lvl ci nie urośnie — głupio zginąć w pierwszym ambushu._',
      options: [
        { label: 'A co z miastem?', goto: 'about_city' },
        { label: 'Powrót', goto: 'intro' },
        { label: 'Dzięki za radę.', goto: 'end' },
      ],
    },
    about_marek: {
      text:
        '🧔 **Marek:** _Pływałem za młodu pod banderą Korony — sztormy, krakeny, jedna noga ' +
        'mniej. Teraz pilnuję mola i opowiadam żółtodziobom, jak nie zginąć przed pierwszą ' +
        'wypłatą. Tyle._',
      options: [
        { label: 'Powrót', goto: 'intro' },
        { label: 'Trzymaj się, kapitanie.', goto: 'end' },
      ],
    },
  };
}

export class Marek extends Npc {
  readonly id = 'marek';
  readonly name = 'Stary Marek';
  readonly description = 'Stary kapitan portu — zna miasto i okoliczne wody.';
  readonly dialog = new MarekDialog();
}
