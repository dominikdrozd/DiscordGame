/**
 * Definicja questa. Statyczne dane (registry) — instance per gracz trzymany
 * jest w `PlayerStats.quests` jako 3 listy ID-ów: active / completed /
 * abandoned. Quest można wziąć **tylko raz** (started = jest w którejkolwiek
 * z 3 list).
 *
 * Mechaniki:
 *  - `expeditionDrop`: dopóki quest jest active, każda zaakceptowana wyprawa
 *    z X% szansą daje `itemId`. Item ląduje w resources.
 *  - `turnInItem`: do oddania questa gracz musi mieć N tych itemów (consumed).
 *  - `killBoss`: alternatywne dokończenie — kill konkretnego bossa = auto-complete.
 *
 * Quest może mieć obie ścieżki (kill boss LUB collect item) — niektóre tak
 * skonstruowane żeby gracz wybrał ścieżkę.
 */

export interface QuestReward {
  /** Złoto na turn-in. */
  gold?: number;
  /** PvP XP. */
  xp?: number;
  /** Combat skill XP. */
  combatXp?: number;
  /** Konkretny `baseId` itemu do zrolowania (rolled instance trafia do plecaka). */
  rewardItemId?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  /** Id NPC od którego się bierze (i u którego oddaje). */
  giverNpcId: string;
  /** Wymóg combat lvl żeby wziąć. */
  requiredCombatLevel?: number;
  /** Inne questy które muszą być completed (chain quests). */
  prerequisiteQuestIds?: string[];
  /**
   * Item dropujący z wypraw dopóki quest jest active. Procent (0-1).
   * Dropi się do `inventory.resources`.
   */
  expeditionDrop?: { itemId: string; chance: number };
  /** Wymagany item (consumed) na turn-in. */
  turnInItem?: { itemId: string; qty: number };
  /** Boss kill który auto-completuje questa (zamiast turn-inu). */
  killBoss?: string;
  reward: QuestReward;
}
