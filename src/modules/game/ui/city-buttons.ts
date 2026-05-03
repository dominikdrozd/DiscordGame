import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { City } from '../cities/index.js';
import { Npc } from '../npcs/npc.js';

const MAX_BUTTONS_PER_ROW = 5;

/**
 * Lista miast jako buttony w menu — po jednym buttonie per miasto.
 *
 * Lock (combat lvl) renderowany jako disabled button z 🔒 — zachowuje slot,
 * gracz widzi że istnieje ale jeszcze niedostępny.
 *
 * `customId` format: `menu:citypick:<cityId>:<userId>` (userId zawsze na końcu).
 */
export function buildCityListRows(
  cities: ReadonlyArray<City>,
  userId: string,
  isAccessible: (city: City) => boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  let count = 0;
  for (const city of cities) {
    if (count >= MAX_BUTTONS_PER_ROW) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
      count = 0;
    }
    const accessible = isAccessible(city);
    const label = accessible ? `🏛️ ${city.name}` : `🔒 ${city.name}`;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`menu:citypick:${city.id}:${userId}`)
        .setLabel(label.slice(0, 80))
        .setStyle(accessible ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!accessible),
    );
    count++;
  }
  if (count > 0) rows.push(row);
  return rows;
}

/**
 * Widok wybranego miasta — sklep + buttony per NPC + powrót do listy miast.
 *
 * `customId` format:
 *  - sklep: `menu:cityshop:<cityId>:<userId>`
 *  - rozmowa: `menu:citytalk:<cityId>:<npcId>:<userId>`
 *  - powrót: `menu:citylist:<userId>`
 */
export function buildCityViewRows(
  cityId: string,
  npcs: ReadonlyArray<Npc>,
  userId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`menu:cityshop:${cityId}:${userId}`)
      .setLabel('🛒 Sklep')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`menu:cityblacksmith:${cityId}:${userId}`)
      .setLabel('🔨 Kowal')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`menu:cityscribe:${cityId}:${userId}`)
      .setLabel('🔍 Skryba')
      .setStyle(ButtonStyle.Success),
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [actionRow];

  let npcRow = new ActionRowBuilder<ButtonBuilder>();
  let count = 0;
  for (const npc of npcs) {
    if (count >= MAX_BUTTONS_PER_ROW) {
      rows.push(npcRow);
      npcRow = new ActionRowBuilder<ButtonBuilder>();
      count = 0;
    }
    npcRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`menu:citytalk:${cityId}:${npc.id}:${userId}`)
        .setLabel(`💬 ${npc.name}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
    );
    count++;
  }
  if (count > 0) rows.push(npcRow);

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`menu:citylist:${userId}`)
        .setLabel('← Miasta')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`menu:close:${userId}`)
        .setLabel('✖ Zamknij')
        .setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}
