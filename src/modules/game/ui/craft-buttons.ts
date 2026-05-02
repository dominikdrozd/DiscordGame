import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string, arg?: string): string {
  return `craft:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;
}

function backToMenuRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`menu:back:${userId}`)
      .setLabel('← Menu')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`menu:close:${userId}`)
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildCraftBrowseRows(
  userId: string,
  recipesLength: number,
  canCraft: boolean,
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(recipesLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('create', userId))
      .setLabel('🛠️ Stwórz')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canCraft),
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(recipesLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('close', userId))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  return fromMenu ? [row, backToMenuRow(userId)] : [row];
}

/** Wiersz po craft/close — sam button "← Menu" gdy browser pochodził z menu. */
export function buildCraftAfterRows(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [backToMenuRow(userId)];
}
