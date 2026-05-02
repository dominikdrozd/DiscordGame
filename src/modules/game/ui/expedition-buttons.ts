import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string, arg?: string): string {
  return `exp:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;
}

/**
 * Wspólny "← Menu" row dodawany pod browser/active gdy view został otwarty
 * przez `menu:exp` button (a nie przez `.expedition` komendę). MenuCommand
 * łapie `menu:back:<uid>` i renderuje main menu.
 */
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

export function buildExpBrowseRows(
  userId: string,
  expsLength: number,
  canEnter: boolean,
  fromMenu = false,
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
  return fromMenu ? [row, backToMenuRow(userId)] : [row];
}

export function buildExpActiveRows(
  userId: string,
  canClaim: boolean,
  fromMenu = false,
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
  return fromMenu ? [row, backToMenuRow(userId)] : [row];
}

/** Wiersz po claim/start/close — sam button "← Menu" gdy view pochodził z menu. */
export function buildExpAfterRows(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [backToMenuRow(userId)];
}
