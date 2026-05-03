import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildBackToMenuRow } from './browser-buttons.js';

/**
 * Browser kowala — ◀ / ▶ + 4 buttony upgrade z różną liczbą diamentów (0-3).
 * Każdy upgrade button: "🔨 +N💎 (X%)" — lub disabled gdy brak diamentów /
 * brak gold / item osiągnął cap miasta / wymóg lvl po upgrade za wysoki.
 *
 * `customId` format:
 *  - `smith:nav:<userId>:<-1|1>` — przewinięcie listy itemów
 *  - `smith:up:<userId>:<diamonds>` — próba upgrade z N diamentami (0-3)
 *  - `smith:close:<userId>` — zamknięcie
 */
export function buildSmithBrowseRows(args: {
  userId: string;
  itemsCount: number;
  upgradeOptions: { diamonds: number; chance: number; disabled: boolean }[];
  fromMenu: boolean;
}): ActionRowBuilder<ButtonBuilder>[] {
  const { userId, itemsCount, upgradeOptions, fromMenu } = args;
  const id = (action: string, arg?: string): string =>
    `smith:${action}:${userId}${arg !== undefined ? `:${arg}` : ''}`;

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(itemsCount <= 1),
    new ButtonBuilder()
      .setCustomId(id('nav', '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(itemsCount <= 1),
    new ButtonBuilder()
      .setCustomId(id('close'))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );

  const upgradeRow = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of upgradeOptions) {
    upgradeRow.addComponents(
      new ButtonBuilder()
        .setCustomId(id('up', String(opt.diamonds)))
        .setLabel(`🔨 +${opt.diamonds}💎 (${opt.chance}%)`.slice(0, 80))
        .setStyle(opt.diamonds === 0 ? ButtonStyle.Primary : ButtonStyle.Success)
        .setDisabled(opt.disabled),
    );
  }

  const rows = [upgradeRow, navRow];
  if (fromMenu) rows.push(buildBackToMenuRow(userId));
  return rows;
}
