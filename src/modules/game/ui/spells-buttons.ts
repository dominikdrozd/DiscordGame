import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildBrowseRows } from './browser-buttons.js';

/**
 * Browser spelli — ◀ / 🎓 Naucz / ▶ + tab row (klasowe / super).
 * `tabRow` jest customowy, więc przekazujemy go jako `extraRows`.
 *
 * `customId` format:
 *  - `spl:nav:<userId>:<-1|1>` — przewinięcie
 *  - `spl:learn:<userId>` — naucz aktualnie wybranego
 *  - `spl:tab:<userId>:<class|super>` — przełącz tab
 *  - `spl:close:<userId>` — zamknięcie
 */
export function buildSpellsBrowseRows(
  userId: string,
  total: number,
  canLearn: boolean,
  currentTab: 'class' | 'super',
  fromMenu = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const tabRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`spl:tab:${userId}:class`)
      .setLabel('📘 Klasowe')
      .setStyle(currentTab === 'class' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentTab === 'class'),
    new ButtonBuilder()
      .setCustomId(`spl:tab:${userId}:super`)
      .setLabel('📜 Super')
      .setStyle(currentTab === 'super' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentTab === 'super'),
  );
  return buildBrowseRows({
    prefix: 'spl',
    userId,
    itemsCount: total,
    mainAction: { id: 'learn', label: '🎓 Naucz się', style: ButtonStyle.Success, disabled: !canLearn },
    fromMenu,
    extraRows: [tabRow],
  });
}
