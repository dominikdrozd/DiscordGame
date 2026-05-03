import { ButtonStyle, type ActionRowBuilder, type ButtonBuilder } from 'discord.js';
import { buildBrowseRows, buildBackToMenuRow } from './browser-buttons.js';

export function buildCraftBrowseRows(
  userId: string,
  recipesLength: number,
  canCraft: boolean,
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return buildBrowseRows({
    prefix: 'craft',
    userId,
    itemsCount: recipesLength,
    mainAction: { id: 'create', label: '🛠️ Stwórz', style: ButtonStyle.Success, disabled: !canCraft },
    fromMenu,
  });
}

/** Wiersz po craft/close — sam ← Menu gdy browser pochodził z menu. */
export function buildCraftAfterRows(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [buildBackToMenuRow(userId)];
}
