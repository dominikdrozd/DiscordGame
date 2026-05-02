import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string, arg?: string): string {
  return `bbr:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;
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

/**
 * Browser bossów — tak samo jak `buildExpBrowseRows`: ◀ / ⚔️ Atak / ▶ / ✖.
 * `fromMenu` dodaje row "← Menu" pod buttonami (otwarte z `menu:boss`).
 *
 * `customId` format:
 *  - `bbr:nav:<userId>:<-1|1>` — przewinięcie listy
 *  - `bbr:enter:<userId>` — atak na aktualnie wybranego bossa
 *  - `bbr:close:<userId>` — zamknięcie browsera
 */
export function buildBossBrowseRows(
  userId: string,
  bossesLength: number,
  canFight: boolean,
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bossesLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('enter', userId))
      .setLabel('⚔️ Atakuj')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canFight),
    new ButtonBuilder()
      .setCustomId(id('nav', userId, '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bossesLength <= 1),
    new ButtonBuilder()
      .setCustomId(id('close', userId))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  return fromMenu ? [row, backToMenuRow(userId)] : [row];
}
