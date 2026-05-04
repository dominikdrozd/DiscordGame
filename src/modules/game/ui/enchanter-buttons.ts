import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { GemElement, GemSize } from '../services/items.js';

const SIZES: GemSize[] = ['small', 'medium', 'large', 'huge'];
const ELEMENTS: GemElement[] = ['fire', 'ice', 'poison'];

const SIZE_LABEL: Record<GemSize, string> = {
  small: 'mały',
  medium: 'średni',
  large: 'duży',
  huge: 'ogromny',
};

const ELEMENT_EMOJI: Record<GemElement, string> = {
  fire: '🔥',
  ice: '❄️',
  poison: '🧪',
};

interface BrowseRowsOpts {
  userId: string;
  itemsCount: number;
  slots: Array<{ idx: number; filled: boolean }>;
  fromMenu: boolean;
}

/**
 * Browser mode rows: nav (◀ ▶), slot action buttons (➕/❌ per slot), close.
 * Discord limit: 5 buttons per row, 5 rows. 4 slots max → 1 row na sloty.
 */
export function buildEnchanterBrowseRows(
  opts: BrowseRowsOpts,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (opts.itemsCount > 0) {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ench:nav:${opts.userId}:-1`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(opts.itemsCount <= 1),
      new ButtonBuilder()
        .setCustomId(`ench:nav:${opts.userId}:1`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(opts.itemsCount <= 1),
    );
    rows.push(navRow);
  }
  if (opts.slots.length > 0) {
    const slotRow = new ActionRowBuilder<ButtonBuilder>();
    for (const s of opts.slots) {
      if (s.filled) {
        slotRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ench:remove:${opts.userId}:${s.idx}`)
            .setLabel(`❌ Slot ${s.idx + 1}`)
            .setStyle(ButtonStyle.Danger),
        );
      } else {
        slotRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ench:pick:${opts.userId}:${s.idx}`)
            .setLabel(`➕ Slot ${s.idx + 1}`)
            .setStyle(ButtonStyle.Success),
        );
      }
    }
    rows.push(slotRow);
  }
  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ench:close:${opts.userId}`)
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(closeRow);
  return rows;
}

/**
 * Gem picker rows: 12 gem buttons (3 elements × 4 sizes), 1 cancel button.
 * Każdy gem button disabled gdy gracz nie ma żadnego (gemCount[id] === 0).
 * Layout: 1 row per element (4 sizes), 4-th row z Cancel.
 */
export function buildEnchanterGemPickerRows(opts: {
  userId: string;
  gemCounts: Record<string, number>;
}): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const elem of ELEMENTS) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const size of SIZES) {
      const id = `gem_${elem}_${size}`;
      const count = opts.gemCounts[id] ?? 0;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ench:insert:${opts.userId}:${id}`)
          .setLabel(`${ELEMENT_EMOJI[elem]} ${SIZE_LABEL[size]} (×${count})`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(count <= 0),
      );
    }
    rows.push(row);
  }
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ench:cancelpick:${opts.userId}`)
      .setLabel('← Cofnij')
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(cancelRow);
  return rows;
}
