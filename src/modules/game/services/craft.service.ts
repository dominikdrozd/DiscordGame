import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { listRecipes, getRecipe, type Recipe } from './recipes.js';
import { rollCraftedInstance, fmtInstance, ITEMS } from './items.js';
import { displayName } from '../../../utils.js';
import { buildCraftBrowseRows, buildCraftAfterRows } from '../ui/craft-buttons.js';

interface BrowserState {
  userId: string;
  index: number;
  /** Czy browser został otwarty z `menu:craft` — wtedy renderujemy ← Menu row. */
  fromMenu: boolean;
}

function sortedRecipes(): Recipe[] {
  return listRecipes().sort((a, b) => {
    if (a.craftingLevelRequired !== b.craftingLevelRequired) {
      return a.craftingLevelRequired - b.craftingLevelRequired;
    }
    return a.id.localeCompare(b.id);
  });
}

export class CraftService {
  private readonly browsers = new Map<string, BrowserState>();

  constructor(private readonly stats: PlayerStatsService) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    if (!prompt) return this.openBrowser(msg);
    return this.craftDirect(msg, prompt);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('craft:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    const arg = parts[3];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój browser.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }

    if (action === 'nav') return this.handleNav(interaction, userId, arg);
    if (action === 'create') return this.handleCreate(interaction, userId);
    if (action === 'close') return this.handleClose(interaction, userId);
  }

  // ── Interactive UI ────────────────────────────────────

  private async openBrowser(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    const recipes = sortedRecipes();
    if (recipes.length === 0) {
      await msg.reply('Brak przepisów.');
      return;
    }
    const state: BrowserState = { userId: msg.author.id, index: 0, fromMenu: false };
    this.browsers.set(msg.author.id, state);
    const recipe = recipes[state.index];
    await msg.reply({
      content: this.renderRecipeContent(recipe, player),
      components: buildCraftBrowseRows(
        player.id,
        recipes.length,
        this.canCraft(recipe, player),
        false,
      ),
    });
  }

  /**
   * Browser craftingu ze slash `/craft` — pierwszy reply ephemeral,
   * bez ← Menu rowu.
   */
  async openFromSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;
    const player = this.stats.get(userId, userName);
    const recipes = sortedRecipes();
    if (recipes.length === 0) {
      await interaction
        .reply({ content: 'Brak przepisów.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const state: BrowserState = { userId, index: 0, fromMenu: false };
    this.browsers.set(userId, state);
    const recipe = recipes[state.index];
    await interaction
      .reply({
        content: this.renderRecipeContent(recipe, player),
        components: buildCraftBrowseRows(
          player.id,
          recipes.length,
          this.canCraft(recipe, player),
          false,
        ),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  /**
   * Wejście do browsera craftingu z buttona menu (`menu:craft`).
   * Używa `interaction.update` zamiast nowej wiadomości — zachowuje
   * pojedynczą wiadomość menu — i dodaje row "← Menu" pod buttonami.
   */
  async openFromInteraction(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;
    const player = this.stats.get(userId, userName);
    const recipes = sortedRecipes();
    if (recipes.length === 0) {
      await interaction.update({ content: 'Brak przepisów.', components: [] }).catch(() => {});
      return;
    }
    const state: BrowserState = { userId, index: 0, fromMenu: true };
    this.browsers.set(userId, state);
    const recipe = recipes[state.index];
    await interaction
      .update({
        content: this.renderRecipeContent(recipe, player),
        components: buildCraftBrowseRows(
          player.id,
          recipes.length,
          this.canCraft(recipe, player),
          true,
        ),
      })
      .catch(() => {});
  }

  private renderRecipeContent(recipe: Recipe, player: PlayerStats): string {
    const outputLine = recipe.outputResource
      ? `${ITEMS[recipe.outputResource.itemId]?.name ?? recipe.outputResource.itemId} ×${recipe.outputResource.qty}`
      : recipe.outputBaseId
        ? `${ITEMS[recipe.outputBaseId]?.name ?? recipe.outputBaseId} (rzucany rarity)`
        : '—';

    const lines: string[] = [
      `🛠️ **${recipe.id}** → ${outputLine}`,
      `Wymagany lvl craftingu: **${recipe.craftingLevelRequired}** · Twój: **${player.skills.crafting.level}**`,
      `Nagroda: +${recipe.xpReward} XP crafting`,
      '',
      '**Składniki:**',
    ];
    for (const [ingId, need] of Object.entries(recipe.ingredients)) {
      const have = player.inventory.resources[ingId] ?? 0;
      const ok = have >= need ? '✅' : '❌';
      lines.push(`${ok} ${ITEMS[ingId]?.name ?? ingId}: **${have}/${need}**`);
    }

    const reasons = this.craftBlockReasons(recipe, player);
    if (reasons.length === 0) {
      lines.push('', '_Możesz scraftować — kliknij **🛠️ Stwórz**._');
    } else {
      lines.push('', '⚠️ ' + reasons.join(' · '));
    }
    return lines.join('\n').slice(0, 1900);
  }

  private craftBlockReasons(recipe: Recipe, player: PlayerStats): string[] {
    const reasons: string[] = [];
    if (player.skills.crafting.level < recipe.craftingLevelRequired) {
      reasons.push(`za niski lvl craftingu (wymaga ${recipe.craftingLevelRequired})`);
    }
    for (const [ingId, need] of Object.entries(recipe.ingredients)) {
      const have = player.inventory.resources[ingId] ?? 0;
      if (have < need) reasons.push(`brak ${ITEMS[ingId]?.name ?? ingId}`);
    }
    return reasons;
  }

  private canCraft(recipe: Recipe, player: PlayerStats): boolean {
    return this.craftBlockReasons(recipe, player).length === 0;
  }

  private async handleNav(
    interaction: ButtonInteraction,
    userId: string,
    dirArg: string | undefined,
  ): Promise<void> {
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Browser zamknięty — wpisz `.craft` żeby otworzyć.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const recipes = sortedRecipes();
    const dir = dirArg === '-1' ? -1 : 1;
    state.index = (state.index + dir + recipes.length) % recipes.length;
    const recipe = recipes[state.index];
    const player = this.stats.get(userId);
    await interaction
      .update({
        content: this.renderRecipeContent(recipe, player),
        components: buildCraftBrowseRows(
          userId,
          recipes.length,
          this.canCraft(recipe, player),
          state.fromMenu,
        ),
      })
      .catch(() => {});
  }

  private async handleCreate(interaction: ButtonInteraction, userId: string): Promise<void> {
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction.reply({ content: 'Browser zamknięty.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const recipes = sortedRecipes();
    const recipe = recipes[state.index];
    const player = this.stats.get(userId);
    const reasons = this.craftBlockReasons(recipe, player);
    if (reasons.length > 0) {
      await interaction
        .reply({ content: `Nie mogę: ${reasons.join(', ')}.`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const result = this.executeCraft(recipe, player);
    if (!result.ok) {
      await interaction
        .reply({ content: result.message ?? 'Bug w crafcie.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: `${this.renderRecipeContent(recipe, player)}\n\n${result.message ?? ''}`,
        components: buildCraftBrowseRows(
          userId,
          recipes.length,
          this.canCraft(recipe, player),
          state.fromMenu,
        ),
      })
      .catch(() => {});
  }

  private async handleClose(interaction: ButtonInteraction, userId: string): Promise<void> {
    const fromMenu = this.browsers.get(userId)?.fromMenu ?? false;
    this.browsers.delete(userId);
    await interaction
      .update({
        content: 'Browser craftingu zamknięty.',
        components: fromMenu ? buildCraftAfterRows(userId) : [],
      })
      .catch(() => {});
  }

  // ── Helpers ───────────────────────────────────────────

  private executeCraft(recipe: Recipe, player: PlayerStats): { ok: boolean; message?: string } {
    for (const [id, qty] of Object.entries(recipe.ingredients)) {
      this.stats.removeResource(player, id, qty);
    }
    let outputLine: string;
    if (recipe.outputResource) {
      const { itemId, qty } = recipe.outputResource;
      this.stats.addResource(player, itemId, qty);
      outputLine = `🧪 **${ITEMS[itemId]?.name ?? itemId} ×${qty}** trafia do plecaka.`;
    } else if (recipe.outputBaseId) {
      const item = rollCraftedInstance(recipe.outputBaseId);
      if (!item) {
        return {
          ok: false,
          message: `Bug w przepisie \`${recipe.id}\` — output nie jest equippable.`,
        };
      }
      this.stats.addItem(player, item);
      outputLine = `Wyszedł: ${fmtInstance(item)} (\`${item.uid}\`)`;
    } else {
      return { ok: false, message: `Bug w przepisie \`${recipe.id}\` — brak outputu.` };
    }
    const leveled = this.stats.addSkillXp(player, 'crafting', recipe.xpReward);
    this.stats.save();
    const lvlMsg = leveled
      ? ` 🎉 **crafting** awansuje na poziom **${player.skills.crafting.level}**!`
      : '';
    return {
      ok: true,
      message: `🛠️ Crafting udany! ${outputLine}\n+${recipe.xpReward} XP crafting.${lvlMsg}`,
    };
  }

  private async craftDirect(msg: any, recipeId: string): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    const recipe = getRecipe(recipeId);
    if (!recipe) {
      await msg.reply(`Nie ma przepisu \`${recipeId}\`. Wpisz \`.craft\` żeby zobaczyć listę.`);
      return;
    }
    const reasons = this.craftBlockReasons(recipe, player);
    if (reasons.length > 0) {
      await msg.reply(`Nie mogę scraftować: ${reasons.join(', ')}.`);
      return;
    }
    const result = this.executeCraft(recipe, player);
    if (!result.ok) {
      await msg.reply(result.message ?? 'Bug w crafcie.');
      return;
    }
    await msg.reply(result.message ?? '🛠️ Crafting udany!');
  }
}
