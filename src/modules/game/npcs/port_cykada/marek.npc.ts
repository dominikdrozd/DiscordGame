import { Dialog, type DialogNode, Npc, type DialogOption } from '../npc.js';
import { listRaces, fmtRaceStats, type Race } from '../../races/index.js';
import { listClasses, fmtPrimary, type ClassDef } from '../../classes/index.js';

const Q1 = 'first_steps';
const Q2 = 'marek_pick_race';
const Q3 = 'marek_pick_class';
const Q4 = 'marek_pickaxe';
const Q5 = 'marek_axe';
const Q6 = 'marek_rod';
const Q7 = 'marek_upgrade';
const Q8 = 'marek_duel';

/**
 * Helper — buduje 4-stanowe gałęzie dla questa typu "collect / kill".
 * Offer pokazuje się TYLKO gdy quest jest aktualnie offerable (prereqs
 * spełnione + nie wzięty wcześniej). Tym sposobem Marek prowadzi gracza
 * po kolei — kolejny quest pojawia się dopiero po skończeniu poprzedniego.
 */
function questBranch(questId: string, label: string): DialogOption[] {
  return [
    {
      label: `📜 ${label}`,
      goto: `q_${questId}_offer`,
      visibleIf: (ctx) => ctx.quests.isOfferable(ctx.player, questId),
    },
    {
      label: `📜 Wracam: ${label}`,
      goto: `q_${questId}_turnin`,
      visibleIf: (ctx) => ctx.quests.canTurnIn(ctx.player, questId),
    },
    {
      label: `📜 (w toku) ${label}`,
      goto: `q_${questId}_progress`,
      visibleIf: (ctx) =>
        ctx.quests.isActive(ctx.player, questId) && !ctx.quests.canTurnIn(ctx.player, questId),
    },
  ];
}

/** Lista ras jako buttony — każdy prowadzi do `race_info_<id>` (potwierdzenie). */
function raceListOptions(): DialogOption[] {
  return listRaces().map((r) => ({
    label: `🧬 ${r.name}`,
    goto: `race_info_${r.id}`,
    visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q2) && !ctx.player.raceId,
  }));
}

/** Per-race node: opis + "Tak biorę / Wracam do wyboru". */
function raceInfoNode(r: Race): DialogNode {
  return {
    text:
      `🧔 **Marek:** _Powiadasz, że ${r.name.toLowerCase()}? Hm._\n\n` +
      `🧬 **${r.name}** — ${r.description}\n` +
      `*Startowe staty:* ${fmtRaceStats(r)}\n\n` +
      `_Wybór jest dożywotni — pomyśl chwilę._`,
    options: [
      {
        label: '✅ Tak, biorę.',
        goto: 'intro',
        visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q2) && !ctx.player.raceId,
        effect: (ctx) => {
          const result = ctx.stats.applyRace(ctx.player, r.id, r.startingStats);
          if (!result.ok) return result.reason ?? 'Nie udało się wybrać rasy.';
          const turn = ctx.quests.turnIn(ctx.player, Q2).line;
          return `🧬 Wybrałeś rasę **${r.name}** (${fmtRaceStats(r)}).\n${turn}`;
        },
      },
      { label: '← Wracam do listy', goto: 'q_marek_pick_race_choose' },
    ],
  };
}

function classListOptions(): DialogOption[] {
  return listClasses().map((c) => ({
    label: `⚔️ ${c.name}`,
    goto: `class_info_${c.id}`,
    visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q3) && !ctx.player.classId,
  }));
}

function classInfoNode(c: ClassDef): DialogNode {
  return {
    text:
      `🧔 **Marek:** _${c.name}, ${c.role.toLowerCase()}? Pasuje ci?_\n\n` +
      `⚔️ **${c.name}** (${c.role}) — ${c.description}\n` +
      `*Startowe atrybuty:* ${fmtPrimary(c.primaryBonus)} · ⚡ baseSpeed: ${c.baseSpeed}\n` +
      `*Skille startowe:* ${c.startingSkills.join(', ')}\n\n` +
      `_Wybór jest dożywotni._`,
    options: [
      {
        label: '✅ Tak, biorę.',
        goto: 'intro',
        visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q3) && !ctx.player.classId,
        effect: (ctx) => {
          const result = ctx.stats.applyClass(ctx.player, c.id, c.primaryBonus, c.startingSkills);
          if (!result.ok) return result.reason ?? 'Nie udało się wybrać klasy.';
          const turn = ctx.quests.turnIn(ctx.player, Q3).line;
          return `⚔️ Wybrałeś klasę **${c.name}** (${c.role}).\n${turn}`;
        },
      },
      { label: '← Wracam do listy', goto: 'q_marek_pick_class_choose' },
    ],
  };
}

class MarekDialog extends Dialog {
  readonly startNodeId = 'intro';
  readonly nodes: Readonly<Record<string, DialogNode>> = {
    intro: {
      text:
        '🧔 **Stary Marek:** _Witaj w Porcie Cykada. Każdy zaczyna tu — i każdy ma okazję się czegoś nauczyć._\n' +
        'Idź po kolei przez moje zadania, a wyrobisz się w grze.',
      options: [
        ...questBranch(Q1, 'Pierwsza Wyprawa'),
        // Q2 (rasa)
        {
          label: '📜 Krew i Pochodzenie',
          goto: 'q_marek_pick_race_offer',
          visibleIf: (ctx) => ctx.quests.isOfferable(ctx.player, Q2),
        },
        {
          label: '📜 Wybór rasy',
          goto: 'q_marek_pick_race_choose',
          visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q2) && !ctx.player.raceId,
        },
        // Q3 (klasa)
        {
          label: '📜 Ścieżka Wojownika',
          goto: 'q_marek_pick_class_offer',
          visibleIf: (ctx) => ctx.quests.isOfferable(ctx.player, Q3),
        },
        {
          label: '📜 Wybór klasy',
          goto: 'q_marek_pick_class_choose',
          visibleIf: (ctx) => ctx.quests.isActive(ctx.player, Q3) && !ctx.player.classId,
        },
        ...questBranch(Q4, 'Kilof i Próbka Rudy'),
        ...questBranch(Q5, 'Siekiera i Drewno'),
        ...questBranch(Q6, 'Wędka i Łuska Cykady'),
        ...questBranch(Q7, 'Próba Kowala'),
        ...questBranch(Q8, 'Pojedynek na Pomoście'),
        { label: 'Opowiedz mi o mieście', goto: 'about_city' },
        { label: 'Już nic. Bywaj.', goto: 'end' },
      ],
    },

    // ── Q1: first_steps ────────────────────────────────
    [`q_${Q1}_offer`]: {
      text:
        '🧔 **Marek:** _Idź na **dowolną wyprawę** — z aktywnym questem token wpadnie do plecaka. Wróć z 1 sztuką._\n_Nagroda: 200g, 100 XP, 50 XP combat._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q1).line,
        },
        { label: 'Może później.', goto: 'intro' },
      ],
    },
    [`q_${Q1}_progress`]: {
      text: '🧔 **Marek:** _Idź na wyprawę — `/menu` → 🗺️ Wyprawy. Token wpadnie z 100% szans._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q1}_turnin`]: {
      text: '🧔 **Marek:** _Token! Brawo._',
      options: [
        {
          label: '🎁 Daj Markowi token.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.turnIn(ctx.player, Q1).line,
        },
        { label: 'Jeszcze chwila.', goto: 'intro' },
      ],
    },

    // ── Q2: marek_pick_race ────────────────────────────
    q_marek_pick_race_offer: {
      text:
        '🧔 **Marek:** _Powiedz, **skąd pochodzisz?** Każda rasa ma swoje atuty — to ważne, kim się nazywasz._',
      options: [
        {
          label: '✅ Powiem ci.',
          goto: 'q_marek_pick_race_choose',
          effect: (ctx) => ctx.quests.take(ctx.player, Q2).line,
        },
        { label: 'Później.', goto: 'intro' },
      ],
    },
    q_marek_pick_race_choose: {
      text:
        '🧔 **Marek:** _Wybierz mądrze. Klikaj — opowiem o każdej rasie zanim się zdecydujesz._',
      options: [...raceListOptions(), { label: 'Wrócę za chwilę.', goto: 'intro' }],
    },

    // ── Q3: marek_pick_class ───────────────────────────
    q_marek_pick_class_offer: {
      text:
        '🧔 **Marek:** _Skoro wiesz kim jesteś, czas wybrać **jak walczysz**. Pięć ścieżek przed tobą — każda inna._',
      options: [
        {
          label: '✅ Słucham.',
          goto: 'q_marek_pick_class_choose',
          effect: (ctx) => ctx.quests.take(ctx.player, Q3).line,
        },
        { label: 'Najpierw popatrzę.', goto: 'intro' },
      ],
    },
    q_marek_pick_class_choose: {
      text: '🧔 **Marek:** _Klikaj — pogadamy o każdej klasie zanim podejmiesz decyzję._',
      options: [...classListOptions(), { label: 'Wrócę za chwilę.', goto: 'intro' }],
    },

    // ── Per-race info nodes (5)
    ...Object.fromEntries(listRaces().map((r) => [`race_info_${r.id}`, raceInfoNode(r)])),
    // ── Per-class info nodes (5)
    ...Object.fromEntries(listClasses().map((c) => [`class_info_${c.id}`, classInfoNode(c)])),

    // ── Q4-Q8 standardowe gałęzie ──────────────────────
    [`q_${Q4}_offer`]: {
      text:
        '🧔 **Marek:** _Drugi krok: skraftuj **kilof** (3× Miedź + 2× Sosna — kup u Witolda). Potem `/mine` — z 30% szans wpadnie próbka rudy._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q4).line,
        },
        { label: 'Później.', goto: 'intro' },
      ],
    },
    [`q_${Q4}_progress`]: {
      text: '🧔 **Marek:** _Skraftuj kilof i kop — token wpadnie z 30% szans._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q4}_turnin`]: {
      text: '🧔 **Marek:** _Próbka rudy. Świetnie._',
      options: [
        {
          label: '🎁 Oddaj.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.turnIn(ctx.player, Q4).line,
        },
        { label: 'Wstrzymaj się.', goto: 'intro' },
      ],
    },

    [`q_${Q5}_offer`]: {
      text:
        '🧔 **Marek:** _Tym razem dam ci materiały (2× Miedź + 3× Sosna na siekierę). Skraftuj ją i pochop — token z 30% szans._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q5).line,
        },
        { label: 'Później.', goto: 'intro' },
      ],
    },
    [`q_${Q5}_progress`]: {
      text: '🧔 **Marek:** _Skraftuj siekierę i pochop drewno — token wpadnie z czasem._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q5}_turnin`]: {
      text: '🧔 **Marek:** _Próbka drewna. Mokra, ciekawa._',
      options: [
        {
          label: '🎁 Oddaj.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.turnIn(ctx.player, Q5).line,
        },
        { label: 'Wstrzymaj się.', goto: 'intro' },
      ],
    },

    [`q_${Q6}_offer`]: {
      text:
        '🧔 **Marek:** _Czas na ryby. Daję ci 4× Sosnę na wędkę. Skraftuj i łów — łuska wpadnie z 30% szans._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q6).line,
        },
        { label: 'Później.', goto: 'intro' },
      ],
    },
    [`q_${Q6}_progress`]: {
      text: '🧔 **Marek:** _Łów aż łuska wpadnie._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q6}_turnin`]: {
      text: '🧔 **Marek:** _Łuska Cykady! Klejnot._',
      options: [
        {
          label: '🎁 Oddaj.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.turnIn(ctx.player, Q6).line,
        },
        { label: 'Jeszcze chwila.', goto: 'intro' },
      ],
    },

    [`q_${Q7}_offer`]: {
      text:
        '🧔 **Marek:** _Idź do **kowala** (Miasta → Port Cykada → 🔨 Kowal) i ulepsz dowolny item. Quest zalicza się przy pierwszym sukcesie._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q7).line,
        },
        { label: 'Później.', goto: 'intro' },
      ],
    },
    [`q_${Q7}_progress`]: {
      text: '🧔 **Marek:** _Każde udane ulepszenie kończy questa. Idź do kowala._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q7}_turnin`]: {
      text: '🧔 **Marek:** _Już ulepszyłeś — szanuję._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },

    [`q_${Q8}_offer`]: {
      text:
        '🧔 **Marek:** _Ostatnie zadanie: stocz **pojedynek z innym graczem**. Niezależnie od wyniku — quest się zalicza. `.duel @user` lub `/duel`._',
      options: [
        {
          label: '✅ Biorę.',
          goto: 'intro',
          effect: (ctx) => ctx.quests.take(ctx.player, Q8).line,
        },
        { label: 'Może później.', goto: 'intro' },
      ],
    },
    [`q_${Q8}_progress`]: {
      text: '🧔 **Marek:** _Walka z drugim graczem — wygrana czy nie, jest w porządku._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },
    [`q_${Q8}_turnin`]: {
      text: '🧔 **Marek:** _Pojedynek się odbył — zalicza się automatem._',
      options: [{ label: 'Powrót', goto: 'intro' }],
    },

    about_city: {
      text:
        '🧔 **Marek:** _Port Cykada to brama Quelthasee. Każdy szczur lądowy zaczyna tu — rybacy nakarmią, górnicy uzbroją, alchemiczka pomoże nie zdechnąć w pierwszej tarapacie. Wpadnij do sklepu, zanim ruszysz głębiej w region._',
      options: [
        { label: 'Powrót', goto: 'intro' },
        { label: 'Bywaj, kapitanie.', goto: 'end' },
      ],
    },
  };
}

export class Marek extends Npc {
  readonly id = 'marek';
  readonly name = 'Stary Marek';
  readonly description = 'Stary kapitan portu — prowadzi cię przez tutorial gry (8 questów).';
  readonly dialog = new MarekDialog();
}
