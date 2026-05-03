import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

function id(action: string, userId: string): string {
  return `menu:${action}:${userId}`;
}

export function buildMenuRows(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('stats', userId))
      .setLabel('📊 Stats')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id('inv', userId))
      .setLabel('🎒 Plecak')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id('skills', userId))
      .setLabel('✨ Skills')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id('spells', userId))
      .setLabel('📘 Spelle')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id('quests', userId))
      .setLabel('📜 Questy')
      .setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('exp', userId))
      .setLabel('🗺️ Wyprawy')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('city', userId))
      .setLabel('🏛️ Miasta')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('craft', userId))
      .setLabel('🛠️ Crafting')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('boss', userId))
      .setLabel('👹 Bossowie')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('dungeon', userId))
      .setLabel('🏰 Dungeony')
      .setStyle(ButtonStyle.Success),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('mine', userId))
      .setLabel('⛏️ Mine')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('fish', userId))
      .setLabel('🎣 Fish')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('chop', userId))
      .setLabel('🪓 Chop')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('party', userId))
      .setLabel('👥 Party')
      .setStyle(ButtonStyle.Primary),
  );
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('refresh', userId))
      .setLabel('🔄 Odśwież')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('close', userId))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
  return [row1, row2, row3, row4];
}

/** Dolny rząd "← Menu" + close — re-export z `browser-buttons.ts` żeby
 * jedno źródło prawdy dla wszystkich sub-views (boss/craft/exp/spells/menu).
 */
export { buildBackToMenuRow } from './browser-buttons.js';
