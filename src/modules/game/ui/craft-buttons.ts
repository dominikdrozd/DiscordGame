import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string, arg?: string): string {
  return `craft:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;
}

export function buildCraftBrowseRows(
  userId: string,
  recipesLength: number,
  canCraft: boolean,
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
  return [row];
}
