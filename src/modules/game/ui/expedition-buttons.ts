import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string, arg?: string): string {
  return `exp:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;
}

export function buildExpBrowseRows(
  userId: string,
  expsLength: number,
  canEnter: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(expsLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('enter', userId))
      .setLabel('🗺️ Wejdź')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canEnter),
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(expsLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('close', userId))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

export function buildExpActiveRows(
  userId: string,
  canClaim: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('refresh', userId))
      .setLabel('🔄 Odśwież')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('claim', userId))
      .setLabel('🎁 Zbierz')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canClaim),
    new ButtonBuilder()
      .setCustomId(id('close', userId))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}
