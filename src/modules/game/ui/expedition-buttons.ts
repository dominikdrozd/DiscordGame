import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildBrowseRows, buildBackToMenuRow } from './browser-buttons.js';

export function buildExpBrowseRows(
  userId: string,
  expsLength: number,
  canEnter: boolean,
  fromMenu = false,
  inParty = false,
): ActionRowBuilder<ButtonBuilder>[] {
  if (!inParty) {
    return buildBrowseRows({
      prefix: 'exp',
      userId,
      itemsCount: expsLength,
      mainAction: { id: 'enter', label: '🗺️ Wejdź', style: ButtonStyle.Success, disabled: !canEnter },
      fromMenu,
    });
  }

  const id = (action: string, arg?: string): string =>
    `exp:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(expsLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('nav', '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(expsLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('close'))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );

  const enterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('enter_solo'))
      .setLabel('🗺️ Wejdź solo')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canEnter),
    new ButtonBuilder()
      .setCustomId(id('enter_party'))
      .setLabel('🗺️ Wejdź z party')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canEnter),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [enterRow, navRow];
  if (fromMenu) rows.push(buildBackToMenuRow(userId));
  return rows;
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
