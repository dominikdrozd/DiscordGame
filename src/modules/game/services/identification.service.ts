import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  IDENTIFY_COSTS,
  MAX_GEM_SLOTS_BY_RARITY,
  RARITY_EMOJI,
  randIntInclusive,
  type ItemInstance,
  type Rarity,
} from './items.js';

/**
 * Diablo-style identyfikacja itemów. Drop-y > common przychodzą z
 * `identified: false` — gracz widzi tylko name/rarity/req lvl. Skryba
 * w mieście za gold flippuje flag i odsłania statystyki + primary stats.
 *
 * Cena per rarity z `IDENTIFY_COSTS`: uncommon 50, rare 200, epic 800,
 * legendary 3000. Brak cooldownu — zachęca do regularnej wizyty w mieście.
 *
 * UX: gracz po klikniecu "🔍 Skryba" w widoku miasta widzi listę swoich
 * niezidentyfikowanych itemów + przycisk "Identify (X zł)" przy każdym.
 */
export class IdentificationService {
  constructor(private readonly stats: PlayerStatsService) {}

  /** Próba identyfikacji itemu — sprawdza gold, deduktuje, flippuje flag. */
  identify(
    player: PlayerStats,
    uid: string,
  ): { ok: boolean; reason?: string; item?: ItemInstance; costGold?: number } {
    const item = this.findItem(player, uid);
    if (!item) return { ok: false, reason: 'Nie posiadasz takiego itemu.' };
    if (item.identified !== false) {
      return { ok: false, reason: 'Item już zidentyfikowany.' };
    }
    const cost = IDENTIFY_COSTS[item.rarity];
    if (cost <= 0) {
      // Common items powinny mieć identified=true z roll-a; defensywny fallback.
      item.identified = true;
      this.stats.save();
      return { ok: true, item, costGold: 0 };
    }
    if (!this.stats.hasGold(player, cost)) {
      return {
        ok: false,
        reason: `Brakuje złota: identyfikacja **${item.name}** kosztuje **${cost} zł** (masz ${player.gold}).`,
        costGold: cost,
      };
    }
    this.stats.removeGold(player, cost);
    item.identified = true;
    // Socketable items dostają sloty na gemy [1, MAX_BY_RARITY] — odsłaniane
    // dopiero przy ID (gracz wcześniej widzi tylko 💎 indicator).
    if (item.socketable && item.gemSlots === undefined) {
      const max = MAX_GEM_SLOTS_BY_RARITY[item.rarity];
      if (max > 0) {
        item.gemSlots = randIntInclusive(1, max);
        item.gems = new Array(item.gemSlots).fill(null);
      }
    }
    this.stats.save();
    return { ok: true, item, costGold: cost };
  }

  /** Lista niezidentyfikowanych itemów gracza. */
  unidentified(player: PlayerStats): ItemInstance[] {
    return this.stats.getItemsForPlayer(player.id).filter((it) => it.identified === false);
  }

  private findItem(player: PlayerStats, uid: string): ItemInstance | undefined {
    return this.stats.findItem(player, uid);
  }

  /** Renderuje widok skryby — lista niezidentyfikowanych z przyciskami identify. */
  async openFromInteraction(
    interaction: ButtonInteraction,
    cityId: string,
  ): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    const items = this.unidentified(player);
    if (items.length === 0) {
      await interaction
        .update({
          content: `🔍 **Skryba** w mieście:\n\n_Nie masz żadnych niezidentyfikowanych przedmiotów._`,
          components: [buildBackRow(cityId, userId)],
        })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: this.renderList(player, items),
        components: this.buildRows(player, items, cityId, userId),
      })
      .catch(() => {});
  }

  /** Click: identify konkretny item. */
  async handleIdentifyClick(
    interaction: ButtonInteraction,
    uid: string,
    cityId: string,
  ): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    const result = this.identify(player, uid);
    if (!result.ok) {
      await interaction
        .reply({ content: `🚫 ${result.reason}`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    // Refresh widoku — pokaż zaktualizowaną listę.
    const items = this.unidentified(player);
    const status = `✅ Zidentyfikowano **${result.item?.name}** za **${result.costGold ?? 0} zł**.`;
    if (items.length === 0) {
      await interaction
        .update({
          content: `${status}\n\n🔍 **Skryba** — wszystko zidentyfikowane.`,
          components: [buildBackRow(cityId, userId)],
        })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: `${status}\n\n${this.renderList(player, items)}`,
        components: this.buildRows(player, items, cityId, userId),
      })
      .catch(() => {});
  }

  private renderList(player: PlayerStats, items: ItemInstance[]): string {
    const lines: string[] = [
      `🔍 **Skryba** — niezidentyfikowane przedmioty (${items.length}). Twoje złoto: 💰 **${player.gold}**.`,
      '',
    ];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cost = IDENTIFY_COSTS[it.rarity];
      lines.push(
        `${i + 1}. ${RARITY_EMOJI[it.rarity]} **${it.name}** \`${it.uid}\` — koszt **${cost} zł**`,
      );
    }
    return lines.join('\n').slice(0, 1900);
  }

  /** 5 buttonów per row (Discord limit). 5 rows max → 25 itemów na ekran. */
  private buildRows(
    player: PlayerStats,
    items: ItemInstance[],
    cityId: string,
    userId: string,
  ): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();
    let count = 0;
    for (const it of items.slice(0, 20)) {
      if (count >= 5) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
        count = 0;
      }
      const cost = IDENTIFY_COSTS[it.rarity];
      const label = `${RARITY_EMOJI[it.rarity]} ${cost}zł`.slice(0, 80);
      const disabled = !this.stats.hasGold(player, cost);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`idfy:${it.uid}:${cityId}:${userId}`)
          .setLabel(label)
          .setStyle(rarityStyle(it.rarity))
          .setDisabled(disabled),
      );
      count++;
    }
    if (count > 0) rows.push(row);
    rows.push(buildBackRow(cityId, userId));
    return rows;
  }

  /** Top-level interaction handler — routuje `idfy:` customId. */
  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('idfy:')) return;
    const parts = interaction.customId.split(':');
    const uid = parts[1];
    const cityId = parts[2];
    const userId = parts[3];
    if (interaction.user.id !== userId) {
      await interaction
        .reply({ content: 'To nie twój skryba.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    await this.handleIdentifyClick(interaction, uid, cityId);
  }
}

function rarityStyle(rarity: Rarity): ButtonStyle {
  switch (rarity) {
    case 'legendary':
      return ButtonStyle.Danger;
    case 'epic':
      return ButtonStyle.Primary;
    case 'rare':
      return ButtonStyle.Primary;
    case 'uncommon':
      return ButtonStyle.Success;
    default:
      return ButtonStyle.Secondary;
  }
}

function buildBackRow(cityId: string, userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`menu:citypick:${cityId}:${userId}`)
      .setLabel('← Miasto')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`menu:close:${userId}`)
      .setLabel('✖ Zamknij')
      .setStyle(ButtonStyle.Danger),
  );
}
