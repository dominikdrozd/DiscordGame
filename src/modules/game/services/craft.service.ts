import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from './player-stats.js';
import { listRecipes, getRecipe, fmtRecipe } from './recipes.js';
import { rollItemInstance, fmtInstance, ITEMS } from './items.js';
import { displayName } from '../../../utils.js';

export class CraftService {
  constructor(private readonly stats: PlayerStatsService) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      const lines = listRecipes()
        .filter((r) => r.craftingLevelRequired <= player.skills.crafting.level + 5)
        .map((r) => fmtRecipe(r));
      const head = `📜 **Twój crafting: lvl ${player.skills.crafting.level}**. Użycie: \`.craft <id>\`.`;
      await msg.reply([head, ...lines].join('\n').slice(0, 1900));
      return;
    }

    const recipe = getRecipe(prompt);
    if (!recipe) {
      await msg.reply(`Nie ma przepisu \`${prompt}\`. Wpisz \`.craft\` żeby zobaczyć listę.`);
      return;
    }

    if (player.skills.crafting.level < recipe.craftingLevelRequired) {
      await msg.reply(
        `Wymagany level craftingu: **${recipe.craftingLevelRequired}** (masz ${player.skills.crafting.level}).`,
      );
      return;
    }

    const missing: string[] = [];
    for (const [id, qty] of Object.entries(recipe.ingredients)) {
      if (!this.stats.hasResource(player, id, qty)) {
        const have = player.inventory.resources[id] ?? 0;
        missing.push(`${ITEMS[id]?.name ?? id} ×${qty} (masz ${have})`);
      }
    }
    if (missing.length) {
      await msg.reply(`Brakuje składników: ${missing.join(', ')}.`);
      return;
    }

    for (const [id, qty] of Object.entries(recipe.ingredients)) {
      this.stats.removeResource(player, id, qty);
    }

    let outputLine: string;
    if (recipe.outputResource) {
      const { itemId, qty } = recipe.outputResource;
      this.stats.addResource(player, itemId, qty);
      outputLine = `🧪 **${ITEMS[itemId]?.name ?? itemId} ×${qty}** trafia do plecaka.`;
    } else if (recipe.outputBaseId) {
      const item = rollItemInstance(recipe.outputBaseId);
      if (!item) {
        await msg.reply(
          `Bug w przepisie \`${recipe.id}\` — output \`${recipe.outputBaseId}\` nie jest equippable.`,
        );
        return;
      }
      this.stats.addItem(player, item);
      outputLine = `Wyszedł: ${fmtInstance(item)} (\`${item.uid}\`)`;
    } else {
      await msg.reply(`Bug w przepisie \`${recipe.id}\` — brak outputu.`);
      return;
    }

    const leveled = this.stats.addSkillXp(player, 'crafting', recipe.xpReward);
    this.stats.save();

    const lvlMsg = leveled
      ? ` 🎉 **crafting** awansuje na poziom **${player.skills.crafting.level}**!`
      : '';
    await msg.reply(`🛠️ Crafting udany! ${outputLine}\n+${recipe.xpReward} XP crafting.${lvlMsg}`);
  }
}
