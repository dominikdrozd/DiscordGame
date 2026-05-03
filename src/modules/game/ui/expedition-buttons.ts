import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildBrowseRows, buildBackToMenuRow } from './browser-buttons.js';

export function buildExpBrowseRows(
  userId: string,
  expsLength: number,
  canEnter: boolean,
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return buildBrowseRows({
    prefix: 'exp',
    userId,
    itemsCount: expsLength,
    mainAction: { id: 'enter', label: '🗺️ Wejdź', style: ButtonStyle.Success, disabled: !canEnter },
    fromMenu,
  });
}

/**
 * Active expedition row — refresh + claim + close. Inny układ niż browser
 * (brak nav), więc nie używa `buildBrowseRows`. Gdy `inAmbush=true` pokazujemy
 * dodatkowy ⚔️ Wróć do walki — re-prompt panelu akcji w wątku ambushu.
 */
export function buildExpActiveRows(
  userId: string,
  canClaim: boolean,
  fromMenu = false,
  inAmbush = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const id = (action: string): string => `exp:${action}:${userId}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('refresh'))
      .setLabel('🔄 Odśwież')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('claim'))
      .setLabel('🎁 Zbierz')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canClaim || inAmbush),
    new ButtonBuilder()
      .setCustomId(id('close'))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  if (inAmbush) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(id('resume'))
        .setLabel('⚔️ Wróć do walki')
        .setStyle(ButtonStyle.Danger),
    );
  }
  return fromMenu ? [row, buildBackToMenuRow(userId)] : [row];
}

export function buildExpAfterRows(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [buildBackToMenuRow(userId)];
}
