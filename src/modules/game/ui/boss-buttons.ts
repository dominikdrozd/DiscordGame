import { ButtonStyle, type ActionRowBuilder, type ButtonBuilder } from 'discord.js';
import { buildBrowseRows } from './browser-buttons.js';

/**
 * Browser bossów — ◀ / ⚔️ Atak / ▶ / ✖ z opcjonalnym ← Menu rowem.
 * Implementacja w `browser-buttons.ts:buildBrowseRows`.
 */
export function buildBossBrowseRows(
  userId: string,
  bossesLength: number,
  canFight: boolean,
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return buildBrowseRows({
    prefix: 'bbr',
    userId,
    itemsCount: bossesLength,
    mainAction: { id: 'enter', label: '⚔️ Atakuj', style: ButtonStyle.Danger, disabled: !canFight },
    fromMenu,
  });
}
