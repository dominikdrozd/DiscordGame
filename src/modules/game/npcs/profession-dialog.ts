import { Dialog, type DialogNode, type DialogOption } from './npc.js';
import { getQuest } from '../quests/index.js';
import { ITEMS } from '../services/items.js';

/**
 * Konfiguracja jednego stage'a w chain quest danego NPC.
 * - `questId` musi istnieć w `QUESTS` registry (sprawdzane runtime).
 * - `displayLabel` to krótki tekst pokazywany na buttonie obok prefiksu 📜.
 * - `referral` (opcjonalne) — referral text wyświetlany w turn-in node po
 *   skończeniu questa, kierujący gracza do następnego NPC.
 *   `null` (lub brak) = ostatni stage chainu (epilog zamiast referrala).
 */
export interface ProfessionStage {
  readonly questId: string;
  readonly displayLabel: string;
  readonly offerText: string;
  readonly progressText: string;
  readonly turnInText: string;
  readonly referral?: { npcName: string; cityName: string } | null;
}

export interface ProfessionDialogConfig {
  readonly intro: string;
  readonly stages: readonly ProfessionStage[];
}

function questBranch(stage: ProfessionStage): DialogOption[] {
  const { questId, displayLabel } = stage;
  return [
    {
      label: `📜 ${displayLabel}`,
      goto: `q_${questId}_offer`,
      visibleIf: (ctx) => ctx.quests.isOfferable(ctx.player, questId),
    },
    {
      label: `📜 Wracam: ${displayLabel}`,
      goto: `q_${questId}_turnin`,
      visibleIf: (ctx) => ctx.quests.canTurnIn(ctx.player, questId),
    },
    {
      label: `📜 (w toku) ${displayLabel}`,
      goto: `q_${questId}_progress`,
      visibleIf: (ctx) =>
        ctx.quests.isActive(ctx.player, questId) && !ctx.quests.canTurnIn(ctx.player, questId),
    },
  ];
}

function turnInBody(stage: ProfessionStage): string {
  if (stage.referral === null) {
    return `${stage.turnInText}\n\n_To koniec mojego łańcucha — gratuluję, zasłużyłeś na uznanie._`;
  }
  if (!stage.referral) {
    return `${stage.turnInText}\n\n_Wracaj do mnie — mam dla ciebie kolejne wyzwanie._`;
  }
  return (
    `${stage.turnInText}\n\n` +
    `Następne wyzwanie czeka u **${stage.referral.npcName}** w mieście **${stage.referral.cityName}**.`
  );
}

/**
 * Buduje pełen dialog NPC profesji (intro + per-quest offer/progress/turnin nodes).
 * Każdy stage produkuje 3 nody (offer, progress, turnin) i 3 opcje w intro.
 *
 * Single-shot na życzenie: gdy questy w chainie są ukończone, opcje znikają i
 * w intro zostaje tylko `Bywaj.`. Spójne z patternem Marka.
 */
export class ProfessionDialog extends Dialog {
  readonly startNodeId = 'intro';
  readonly nodes: Readonly<Record<string, DialogNode>>;

  constructor(cfg: ProfessionDialogConfig) {
    super();
    const introOptions: DialogOption[] = [];
    for (const stage of cfg.stages) introOptions.push(...questBranch(stage));
    introOptions.push({ label: 'Bywaj.', goto: 'end' });

    const nodes: Record<string, DialogNode> = {
      intro: {
        text: cfg.intro,
        options: introOptions,
      },
    };

    for (const stage of cfg.stages) {
      const turnInItemQty = (() => {
        const def = getQuest(stage.questId);
        if (!def?.turnInItem) return '';
        const item = ITEMS[def.turnInItem.itemId];
        const name = item?.name ?? def.turnInItem.itemId;
        return ` (potrzeba **${name} ×${def.turnInItem.qty}**)`;
      })();

      nodes[`q_${stage.questId}_offer`] = {
        text: `${stage.offerText}${turnInItemQty}`,
        options: [
          {
            label: '✅ Biorę.',
            goto: 'intro',
            effect: (ctx) => ctx.quests.take(ctx.player, stage.questId).line,
          },
          { label: 'Później.', goto: 'intro' },
        ],
      };

      nodes[`q_${stage.questId}_progress`] = {
        text: stage.progressText,
        options: [{ label: 'Powrót', goto: 'intro' }],
      };

      nodes[`q_${stage.questId}_turnin`] = {
        text: turnInBody(stage),
        options: [
          {
            label: '🎁 Oddaj.',
            goto: 'intro',
            effect: (ctx) => ctx.quests.turnIn(ctx.player, stage.questId).line,
          },
          { label: 'Wstrzymaj się.', goto: 'intro' },
        ],
      };
    }

    this.nodes = nodes;
  }
}
