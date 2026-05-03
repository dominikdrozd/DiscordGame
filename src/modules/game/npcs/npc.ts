import type { PlayerStats } from '../services/player-stats.js';
import type { QuestService } from '../services/quest.service.js';

/**
 * Pojedyncza odpowiedź gracza w dialogu — jeden button.
 *
 * `goto` wskazuje docelowy `nodeId` w tym samym dialogu lub literał `'end'`,
 * który kończy rozmowę i wraca do widoku miasta.
 *
 * `visibleIf`: filtr widoczności opcji — np. tylko gdy quest active /
 * gracz ma item / ukończył wcześniejszego questa. Wywoływane przy
 * każdym renderze noda przez DialogService.
 *
 * `effect`: side-effect po kliknięciu opcji (np. `quests.take('first_steps')`).
 * Wywoływane PRZED nawigacją do `goto`. DialogService sam zapisuje stan
 * po `effect`, więc callback tylko mutuje `ctx.player` / `ctx.quests`.
 */
export interface DialogOption {
  readonly label: string;
  readonly goto: string;
  readonly visibleIf?: (ctx: DialogContext) => boolean;
  readonly effect?: (ctx: DialogContext) => string | void;
}

export interface DialogNode {
  readonly text: string;
  readonly options: readonly DialogOption[];
}

/**
 * Graf rozmowy NPC. `nodes[startNodeId]` to wejście; opcja z `goto: 'end'` zamyka dialog.
 */
export abstract class Dialog {
  abstract readonly startNodeId: string;
  abstract readonly nodes: Readonly<Record<string, DialogNode>>;

  getNode(nodeId: string): DialogNode | undefined {
    return this.nodes[nodeId];
  }
}

export interface DialogContext {
  readonly player: PlayerStats;
  readonly npc: Npc;
  /**
   * Quest API dostępne w `visibleIf` / `effect` opcji dialogowych.
   * Przekazywane przez DialogService przy renderze i obsłudze kliku.
   */
  readonly quests: QuestService;
}

export abstract class Npc {
  abstract readonly id: string;
  abstract readonly name: string;
  /** Krótki opis pokazywany na buttonie / w embedach. */
  abstract readonly description: string;
  abstract readonly dialog: Dialog;
}
