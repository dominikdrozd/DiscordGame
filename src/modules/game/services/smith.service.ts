import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  type ItemInstance,
  appliedItemStats,
  fmtInstance,
  fmtStats,
  itemRequiredLevel,
  itemUpgradeLevel,
  rollUpgradeRecord,
} from './items.js';
import { getCity } from '../cities/index.js';
import { buildSmithBrowseRows } from '../ui/smith-buttons.js';
import type { QuestService } from './quest.service.js';

/**
 * SmithService — system ulepszania itemów u kowala. Browser pattern z
 * ◀/▶ na liście wszystkich upgradeable itemów (założonych + z plecaka).
 *
 * **Mechanika**:
 *  - Bazowy success rate: `100 - 10 × targetLevel` (= 90% dla +1, 80% +2, …)
 *  - Każdy diament: +5% szansy (max 3 diamenty z UI = +15%)
 *  - Failure: usuwa **ostatni** upgrade record (level -1, min 0). Reverse safe.
 *  - Koszt: 150 × targetLevel złota
 *  - Cap per city: region × 3 (R1=3, R2=6, R3=9, R4=12). Wyższe upgrade
 *    wymagają wyższego miasta.
 *  - Każdy upgrade dodaje +1 do wymaganego combat lvl itemu (sprawdzane
 *    przy equip).
 *
 * Stats z upgrade trzymane w `ItemInstance.upgrades: UpgradeRecord[]` —
 * każdy record ma swoje rolled bonusy (DMG +2-3 + istniejące staty +1-3
 * z rarity bias). Pop ostatniego = full revert tego upgradu.
 */

interface BrowserState {
  userId: string;
  cityId: string;
  fromMenu: boolean;
  index: number;
  /** Ostatni komunikat (success/fail) — pokazujemy nad item card po akcji. */
  lastMessage?: string;
}

const BASE_SUCCESS_PER_LEVEL = 10; // -10% per upgrade level
const DIAMOND_BONUS_PCT = 5;
const MAX_DIAMONDS_PER_ATTEMPT = 3;
const COST_PER_LEVEL = 150;
const DIAMOND_ITEM_ID = 'gem_diamond';

function cityMaxUpgrade(cityId: string): number {
  const city = getCity(cityId);
  return city ? city.region * 3 : 0;
}

function successChance(targetLevel: number, diamonds: number): number {
  const base = Math.max(10, 100 - BASE_SUCCESS_PER_LEVEL * targetLevel);
  const bonus = Math.min(diamonds, MAX_DIAMONDS_PER_ATTEMPT) * DIAMOND_BONUS_PCT;
  return Math.min(100, base + bonus);
}

function upgradeableItems(p: PlayerStats): ItemInstance[] {
  // Sort: założone najpierw (weapon, armor, tool), potem reszta z plecaka.
  const equippedUids = new Set([p.equipped.weapon, p.equipped.armor, p.equipped.tool].filter(Boolean));
  const upgradeable = p.inventory.items.filter((it) => it.slot);
  return [...upgradeable].sort((a, b) => {
    const aE = equippedUids.has(a.uid) ? 0 : 1;
    const bE = equippedUids.has(b.uid) ? 0 : 1;
    if (aE !== bE) return aE - bE;
    return a.name.localeCompare(b.name);
  });
}

export class SmithService {
  private readonly browsers = new Map<string, BrowserState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly quests?: QuestService,
  ) {}

  /** Wejście z `menu:cityblacksmith:<cityId>` — interaction.update na ephemeral. */
  async openFromInteraction(interaction: ButtonInteraction, cityId: string): Promise<void> {
    const userId = interaction.user.id;
    this.stats.get(userId, interaction.user.globalName || interaction.user.username);
    const state: BrowserState = { userId, cityId, fromMenu: true, index: 0 };
    this.browsers.set(userId, state);
    await this.renderBrowser(interaction, state);
  }

  /** Wejście z `/smith` — interaction.reply ephemeral. */
  async openFromSlash(interaction: ChatInputCommandInteraction, cityId: string): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(userId, interaction.user.globalName || interaction.user.username);
    const state: BrowserState = { userId, cityId, fromMenu: false, index: 0 };
    this.browsers.set(userId, state);
    const items = upgradeableItems(player);
    await interaction
      .reply({
        content: this.renderContent(player, state, items),
        components: this.renderRows(player, state, items),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('smith:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: 'To nie twój kowal.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction.reply({ content: 'Sesja kowala wygasła — otwórz ponownie.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const player = this.stats.get(userId);

    if (action === 'close') {
      this.browsers.delete(userId);
      await interaction.update({ content: 'Kowal odprawił cię z kuźni.', components: [] }).catch(() => {});
      return;
    }
    if (action === 'nav') {
      const dir = parts[3] === '-1' ? -1 : 1;
      const items = upgradeableItems(player);
      if (items.length === 0) {
        await this.renderBrowser(interaction, state);
        return;
      }
      state.index = (state.index + dir + items.length) % items.length;
      state.lastMessage = undefined;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'up') {
      const diamonds = Math.min(MAX_DIAMONDS_PER_ATTEMPT, parseInt(parts[3], 10) || 0);
      const items = upgradeableItems(player);
      const item = items[state.index];
      if (!item) {
        state.lastMessage = '🚫 Brak itemu na liście.';
        await this.renderBrowser(interaction, state);
        return;
      }
      const result = this.tryUpgrade(player, item.uid, diamonds, state.cityId);
      this.stats.save();
      state.lastMessage = result.line;
      // Item mógł zostać przesunięty (nadal istnieje — upgrade nie usuwa);
      // lista nie zmienia kolejności bo nie zmienia się equipped/sort key.
      await this.renderBrowser(interaction, state);
      return;
    }
  }

  /**
   * Próba ulepszenia itemu. Walidacje + roll + commit. Zwraca line do logu.
   */
  tryUpgrade(
    p: PlayerStats,
    uid: string,
    diamonds: number,
    cityId: string,
  ): { ok: boolean; line: string } {
    const item = this.stats.findItem(p, uid);
    if (!item || !item.slot) return { ok: false, line: '🚫 Nie ma takiego itemu (lub nie da się ulepszyć).' };
    const currentLvl = itemUpgradeLevel(item);
    const targetLvl = currentLvl + 1;
    const cap = cityMaxUpgrade(cityId);
    if (cap === 0) return { ok: false, line: '🚫 Nieznane miasto kowala.' };
    if (currentLvl >= cap) {
      return {
        ok: false,
        line: `🚫 Kowal w **${getCity(cityId)?.name ?? cityId}** robi max **+${cap}**. Ten item już ma **+${currentLvl}** — szukaj wyższego miasta.`,
      };
    }
    const cost = COST_PER_LEVEL * targetLvl;
    if (p.gold < cost) return { ok: false, line: `🚫 Brak złota — potrzeba ${cost}g, masz ${p.gold}g.` };
    const have = p.inventory.resources[DIAMOND_ITEM_ID] ?? 0;
    const useDiamonds = Math.min(diamonds, MAX_DIAMONDS_PER_ATTEMPT, have);
    if (diamonds > useDiamonds) {
      return { ok: false, line: `🚫 Brak diamentów — chcesz użyć ${diamonds}, masz ${have}.` };
    }
    const chance = successChance(targetLvl, useDiamonds);

    // Commit: deduct first, then roll.
    this.stats.removeGold(p, cost);
    if (useDiamonds > 0) this.stats.removeResource(p, DIAMOND_ITEM_ID, useDiamonds);

    const roll = Math.random() * 100;
    if (roll < chance) {
      const record = rollUpgradeRecord(item);
      if (!item.upgrades) item.upgrades = [];
      item.upgrades.push(record);
      const bonusText = fmtStats({ ...record });
      // Quest hook — auto-complete questy z `triggerOnUpgrade`.
      const questLines = this.quests?.onItemUpgraded(p) ?? [];
      const questSuffix = questLines.length > 0 ? `\n${questLines.join('\n')}` : '';
      return {
        ok: true,
        line: `✅ **Sukces!** ${item.name} → **+${targetLvl}** (bonus: ${bonusText}). Koszt: ${cost}g, ${useDiamonds}💎.${questSuffix}`,
      };
    } else {
      // Failure: pop last upgrade record. If level was 0 — nothing to pop, item zostaje na 0.
      const popped = item.upgrades?.pop();
      if (popped) {
        return {
          ok: false,
          line: `💥 **Porażka!** ${item.name} cofnięty do **+${currentLvl - 1}** (zwrot bonusu: ${fmtStats({ ...popped })}). Koszt: ${cost}g, ${useDiamonds}💎.`,
        };
      }
      return {
        ok: false,
        line: `💥 **Porażka!** ${item.name} pozostaje na **+0** (nie da się cofnąć poniżej). Koszt: ${cost}g, ${useDiamonds}💎.`,
      };
    }
  }

  private async renderBrowser(interaction: ButtonInteraction, state: BrowserState): Promise<void> {
    const player = this.stats.get(state.userId);
    const items = upgradeableItems(player);
    await interaction
      .update({
        content: this.renderContent(player, state, items),
        components: this.renderRows(player, state, items),
      })
      .catch(() => {});
  }

  private renderContent(p: PlayerStats, state: BrowserState, items: ItemInstance[]): string {
    const city = getCity(state.cityId);
    const cap = cityMaxUpgrade(state.cityId);
    const header = `🔨 **Kowal w ${city?.name ?? state.cityId}** _(max +${cap})_ — 💰 **${p.gold}g**, 💎 **${p.inventory.resources[DIAMOND_ITEM_ID] ?? 0}**`;
    if (items.length === 0) {
      return `${header}\n\n_Nie masz żadnych itemów do ulepszenia (broń/zbroja/narzędzia w plecaku lub założone)._`;
    }
    if (state.index >= items.length) state.index = 0;
    const item = items[state.index];
    const lvl = itemUpgradeLevel(item);
    const equippedFlag =
      p.equipped.weapon === item.uid ||
      p.equipped.armor === item.uid ||
      p.equipped.tool === item.uid
        ? ' 🟢 _(założone)_'
        : '';
    const targetLvl = lvl + 1;
    const cost = COST_PER_LEVEL * targetLvl;
    const reqLvlAfter = targetLvl;
    const playerCombat = p.skills.combat.level;
    const tooHighAfter = playerCombat < reqLvlAfter;
    const reqLine = tooHighAfter
      ? `⚠️ 🔴 Po upgrade wymóg combat lvl **${reqLvlAfter}** — masz **${playerCombat}**, nie założysz!`
      : `Po upgrade wymóg combat lvl ${reqLvlAfter} (masz ${playerCombat}) ✅`;
    const atCap = lvl >= cap;
    const lines: string[] = [
      header,
      '',
      state.lastMessage ?? '',
      state.lastMessage ? '' : '',
      `📦 **[${state.index + 1}/${items.length}]** ${fmtInstance(item)}${equippedFlag}`,
      `_Bazowe staty + upgrade:_ ${fmtStats(appliedItemStats(item))}`,
    ];
    if (atCap) {
      lines.push('', `🚫 **Cap osiągnięty** (+${lvl} = max dla **${city?.name}**, region ${city?.region}). Idź do wyższego miasta żeby kontynuować.`);
    } else {
      lines.push(
        '',
        `🎯 Następny: **+${lvl}** → **+${targetLvl}**`,
        `💰 Koszt: **${cost}g** · 🎲 Bazowa szansa: **${successChance(targetLvl, 0)}%** (każdy 💎 = +${DIAMOND_BONUS_PCT}%)`,
        reqLine,
        '',
        `_Failure cofa upgrade o **-1** (pop ostatniego bonusu — bez utraty oryginalnych statów)._`,
      );
    }
    return lines.filter(Boolean).join('\n').slice(0, 1900);
  }

  private renderRows(p: PlayerStats, state: BrowserState, items: ItemInstance[]) {
    if (items.length === 0) return [];
    const item = items[state.index];
    if (!item) return [];
    const lvl = itemUpgradeLevel(item);
    const cap = cityMaxUpgrade(state.cityId);
    const targetLvl = lvl + 1;
    const cost = COST_PER_LEVEL * targetLvl;
    const have = p.inventory.resources[DIAMOND_ITEM_ID] ?? 0;
    const atCap = lvl >= cap;
    const noGold = p.gold < cost;
    const upgradeOptions = [0, 1, 2, 3].map((d) => ({
      diamonds: d,
      chance: successChance(targetLvl, d),
      disabled: atCap || noGold || d > have,
    }));
    return buildSmithBrowseRows({
      userId: state.userId,
      itemsCount: items.length,
      upgradeOptions,
      fromMenu: state.fromMenu,
    });
  }
}
