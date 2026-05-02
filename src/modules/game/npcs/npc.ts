import type { PlayerStats } from '../services/player-stats.js';

/**
 * Pojedyncza odpowiedź gracza w dialogu — jeden button.
 *
 * `goto` wskazuje docelowy `nodeId` w tym samym dialogu lub literał `'end'`,
 * który kończy rozmowę i wraca do widoku miasta.
 *
 * `visibleIf` i `effect` są zarezerwowane na questy/warunki — na razie nieużywane,
 * ale TS pozwala je dodać bez modyfikacji konsumentów.
 */
export interface DialogOption {
  readonly label: string;
  readonly goto: string;
  readonly visibleIf?: (ctx: DialogContext) => boolean;
  readonly effect?: (ctx: DialogContext) => void;
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
}

export abstract class Npc {
  abstract readonly id: string;
  abstract readonly name: string;
  /** Krótki opis pokazywany na buttonie / w embedach. */
  abstract readonly description: string;
  abstract readonly dialog: Dialog;
}
