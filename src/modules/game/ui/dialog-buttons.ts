import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { type DialogOption } from '../npcs/npc.js';

const MAX_BUTTONS_PER_ROW = 5;

/**
 * Buttony opcji dialogowych. Każda opcja → jeden button z `customId` =
 * `dialog:goto:<npcId>:<gotoNodeId>:<userId>`. Opcja z `goto: 'end'` używa
 * stylu Danger żeby graficznie wyróżnić "wyjście".
 */
export function buildDialogOptionRows(
  npcId: string,
  options: ReadonlyArray<DialogOption>,
  userId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  let count = 0;
  for (const opt of options) {
    if (count >= MAX_BUTTONS_PER_ROW) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
      count = 0;
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dialog:goto:${npcId}:${opt.goto}:${userId}`)
        .setLabel(opt.label.slice(0, 80))
        .setStyle(opt.goto === 'end' ? ButtonStyle.Danger : ButtonStyle.Primary),
    );
    count++;
  }
  if (count > 0) rows.push(row);
  return rows;
}
