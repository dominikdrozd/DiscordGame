import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { type DialogOption } from '../npcs/npc.js';

const MAX_BUTTONS_PER_ROW = 5;

/**
 * Buttony opcji dialogowych — jeden button per **widoczna** opcja
 * (po przefiltrowaniu przez `visibleIf` w DialogService).
 *
 * `customId` format: `dialog:opt:<npcId>:<currentNodeId>:<optIdx>:<userId>`
 * gdzie `optIdx` to index w przefiltrowanej liście. DialogService przy
 * obsłudze kliku ponownie filtruje opcje (stan mógł się zmienić — np.
 * effect poprzedniego kliku zmienił quest active) i bierze `[optIdx]`.
 *
 * Opcja z `goto: 'end'` używa stylu Danger.
 */
export function buildDialogOptionRows(
  npcId: string,
  currentNodeId: string,
  options: ReadonlyArray<DialogOption>,
  userId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  let count = 0;
  options.forEach((opt, idx) => {
    if (count >= MAX_BUTTONS_PER_ROW) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
      count = 0;
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dialog:opt:${npcId}:${currentNodeId}:${idx}:${userId}`)
        .setLabel(opt.label.slice(0, 80))
        .setStyle(opt.goto === 'end' ? ButtonStyle.Danger : ButtonStyle.Primary),
    );
    count++;
  });
  if (count > 0) rows.push(row);
  return rows;
}
