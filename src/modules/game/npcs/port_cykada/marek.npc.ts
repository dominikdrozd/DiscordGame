import { Dialog, type DialogNode, Npc } from '../npc.js';

const FIRST_STEPS = 'first_steps';

class MarekDialog extends Dialog {
  readonly startNodeId = 'intro';
  readonly nodes: Readonly<Record<string, DialogNode>> = {
    intro: {
      text:
        '🧔 **Stary Marek:** _Ej, podróżniku — nowa twarz w Porcie Cykada, co?_\n' +
        'Mów wprost, czego ci trzeba — czas to złoto, a fala nie czeka.',
      options: [
        // Quest line — kondycje pokazują/ukrywają opcje per stan questa.
        {
          label: '📜 Masz dla mnie robotę?',
          goto: 'quest_offer',
          visibleIf: (ctx) => !ctx.quests.isStarted(ctx.player, FIRST_STEPS),
        },
        {
          label: '📜 Wracam z robotą.',
          goto: 'quest_turnin',
          visibleIf: (ctx) => ctx.quests.canTurnIn(ctx.player, FIRST_STEPS),
        },
        {
          label: '📜 (quest aktywny — szukam pamiątki…)',
          goto: 'quest_progress',
          visibleIf: (ctx) =>
            ctx.quests.isActive(ctx.player, FIRST_STEPS) &&
            !ctx.quests.canTurnIn(ctx.player, FIRST_STEPS),
        },
        {
          label: '📜 Pamiętasz tego pierwszego questa?',
          goto: 'quest_done_remember',
          visibleIf: (ctx) => ctx.quests.isCompleted(ctx.player, FIRST_STEPS),
        },
        // Standardowe opcje
        { label: 'Opowiedz mi o mieście', goto: 'about_city' },
        { label: 'Co dalej za horyzontem?', goto: 'about_world' },
        { label: 'Skąd ty się tu wziąłeś?', goto: 'about_marek' },
        { label: 'Już nic. Bywaj.', goto: 'end' },
      ],
    },

    quest_offer: {
      text:
        '🧔 **Marek:** _Mam coś. Zbieram pamiątki z dalekich wypraw — taki **Cykada Token**, ' +
        'kawałek mosiądzu z wydobytego portu. Idziesz na wyprawę — z 30% szansą wpadnie ci ' +
        'do plecaka. Wróć z jednym, dam ci pieniądze i ciepłe słowo._\n\n' +
        '_Nagroda:_ **200g**, **100 XP PvP**, **50 XP combat**.\n' +
        '_Quest tylko raz w życiu — biorąc, zobowiązujesz się dokończyć lub porzucić bezpowrotnie._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'quest_taken',
          effect: (ctx) => {
            const result = ctx.quests.take(ctx.player, FIRST_STEPS);
            return result.line;
          },
        },
        { label: 'Nie teraz.', goto: 'intro' },
      ],
    },

    quest_taken: {
      text:
        '🧔 **Marek:** _Świetnie. Idź na wyprawy, każda ma 30% szans na drop. Wróć z tokenem._',
      options: [{ label: 'Dzięki, do roboty.', goto: 'end' }],
    },

    quest_progress: {
      text:
        '🧔 **Marek:** _Jeszcze nie znalazłeś tokenu, co? Idź na kolejną wyprawę — fortuna ' +
        'sprzyja wytrwałym. Albo daj sobie spokój i porzuć questa w `/menu` → 📜 Questy._',
      options: [
        { label: 'Spróbuję dalej.', goto: 'intro' },
        { label: 'Jasne, idę.', goto: 'end' },
      ],
    },

    quest_turnin: {
      text:
        '🧔 **Marek:** _Masz token? Brawo! Dawaj — to twoja działka._',
      options: [
        {
          label: '🎁 Tu masz.',
          goto: 'quest_finished',
          effect: (ctx) => {
            const result = ctx.quests.turnIn(ctx.player, FIRST_STEPS);
            return result.line;
          },
        },
        { label: 'Jeszcze nie, czekaj.', goto: 'intro' },
      ],
    },

    quest_finished: {
      text:
        '🧔 **Marek:** _Dobry chłop. Teraz wypij, odpocznij. Świat ma więcej zadań niż ' +
        'dni w roku — następne sprawy wkrótce._',
      options: [{ label: 'Bywaj, kapitanie.', goto: 'end' }],
    },

    quest_done_remember: {
      text:
        '🧔 **Marek:** _Pamiętam. Dobrze się sprawiłeś przy tym tokenie. Przy okazji powiem ' +
        'kompanom z floty, że można na ciebie liczyć._',
      options: [{ label: 'Powrót', goto: 'intro' }],
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
  readonly description = 'Stary kapitan portu — zna miasto i okoliczne wody. Rozdaje też pierwszego questa.';
  readonly dialog = new MarekDialog();
}
