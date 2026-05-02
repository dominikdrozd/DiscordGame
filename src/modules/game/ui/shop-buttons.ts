import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const MAX_SELL_QTY = 5;

function id(action: string, cityId: string, userId: string, itemId?: string, arg?: string): string {
  let s = `shop:${action}:${cityId}:${userId}`;
  if (itemId !== undefined) s += `:${itemId}`;
  if (arg !== undefined) s += `:${arg}`;
  return s;
}

export interface ShopItemRowData {
  cityId: string;
  userId: string;
  itemId: string;
  buyPrice: number;
  haveQty: number;
  playerGold: number;
  sellMode: boolean;
}

export function buildShopItemRows(data: ShopItemRowData): ActionRowBuilder<ButtonBuilder>[] {
  const main = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('buy', data.cityId, data.userId, data.itemId))
      .setLabel(`Kup (${data.buyPrice} zł)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(data.playerGold < data.buyPrice),
  );
  if (data.haveQty > 0) {
    main.addComponents(
      new ButtonBuilder()
        .setCustomId(id('sell', data.cityId, data.userId, data.itemId))
        .setLabel(`Sprzedaj [${data.haveQty}]`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(data.sellMode),
    );
  }
  const rows: ActionRowBuilder<ButtonBuilder>[] = [main];
  if (data.sellMode && data.haveQty > 0) {
    const max = Math.min(MAX_SELL_QTY, data.haveQty);
    const qtyRow = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 1; i <= max; i++) {
      qtyRow.addComponents(
        new ButtonBuilder()
          .setCustomId(id('sellqty', data.cityId, data.userId, data.itemId, String(i)))
          .setLabel(`${i}`)
          .setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(qtyRow);
  }
  return rows;
}

export function buildShopCloseRow(
  cityId: string,
  userId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(id('close', cityId, userId))
        .setLabel('✖ Zamknij sklep')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}
