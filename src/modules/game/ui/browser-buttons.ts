import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Wspólny builder rzędu buttonów dla browserów (boss/craft/expedition/spells).
 * Pattern: ◀ / [main action] / ▶ / ✖ — z opcjonalnymi `extraRows` (np. taby
 * w spell browserze) i `fromMenu` rowem (← Menu, otwarte z `/menu`).
 *
 * `customId` format dla buttonów browsera:
 *  - `<prefix>:nav:<userId>:<-1|1>` — przewinięcie listy
 *  - `<prefix>:<actionId>:<userId>` — main action (atak / stwórz / naucz)
 *  - `<prefix>:close:<userId>` — zamknięcie
 *
 * Service handluje te customIds w `handleInteraction()`.
 */
export interface BrowserMainAction {
  /** Akcja w customId (np. 'enter', 'create', 'learn'). */
  id: string;
  label: string;
  style: ButtonStyle;
  disabled?: boolean;
}

export interface BuildBrowseRowsConfig {
  prefix: string;
  userId: string;
  itemsCount: number;
  mainAction: BrowserMainAction;
  fromMenu: boolean;
  /** Dodatkowe rzędy (np. tab row w SpellsService) — wstawiane PRZED nav row. */
  extraRows?: ActionRowBuilder<ButtonBuilder>[];
}

export function buildBrowseRows(cfg: BuildBrowseRowsConfig): ActionRowBuilder<ButtonBuilder>[] {
  const id = (action: string, arg?: string): string =>
    `${cfg.prefix}:${action}:${cfg.userId}${arg !== undefined ? `:${arg}` : ''}`;

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('nav', '-1'))
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cfg.itemsCount <= 1),
    new ButtonBuilder()
      .setCustomId(id(cfg.mainAction.id))
      .setLabel(cfg.mainAction.label)
      .setStyle(cfg.mainAction.style)
      .setDisabled(!!cfg.mainAction.disabled),
    new ButtonBuilder()
      .setCustomId(id('nav', '1'))
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cfg.itemsCount <= 1),
    new ButtonBuilder()
      .setCustomId(id('close'))
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (cfg.extraRows) rows.push(...cfg.extraRows);
  rows.push(navRow);
  if (cfg.fromMenu) rows.push(buildBackToMenuRow(cfg.userId));
  return rows;
}

/** ← Menu + ✖ Zamknij row — używany przez wszystkie sub-views menu. */
export function buildBackToMenuRow(userId: string): ActionRowBuilder<ButtonBuilder> {
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
