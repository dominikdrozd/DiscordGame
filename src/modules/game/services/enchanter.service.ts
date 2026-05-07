import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  type ItemInstance,
  type GemSize,
  ENCHANTER_MATERIAL_IDS,
  fmtInstance,
  ITEMS,
} from './items.js';
import { parseGemId } from './gem-effects.js';
import { getCity } from '../cities/index.js';
import {
  buildEnchanterBrowseRows,
  buildEnchanterGemPickerRows,
} from '../ui/enchanter-buttons.js';

/**
 * EnchanterService — wkładanie/wyjmowanie gemów do/z socketable itemów
 * (broń/pancerz/narzędzie z dungeon/boss/expedition drop). Mirror SmithService:
 * nawigacja ◀/▶ po itemach z `gemSlots > 0`, per-slot button "Włóż"/"Wyjmij".
 *
 * Insert: koszt gold + rubin/szafir/szmaragd wg size. Remove: ½ gold, gem do plecaka.
 * Stackowanie efektów wynika z liczby gemów w slotach (combat: weaponGems[] iter).
 */

type Mode = { kind: 'browse' } | { kind: 'pick'; slotIdx: number };

interface BrowserState {
  userId: string;
  cityId: string;
  fromMenu: boolean;
  index: number;
  mode: Mode;
  lastMessage?: string;
}

const SIZES: GemSize[] = ['small', 'medium', 'large', 'huge'];

const INSERT_COST: Record<
  GemSize,
  { gold: number; ruby: number; sapphire: number; emerald: number }
> = {
  small: { gold: 60, ruby: 1, sapphire: 0, emerald: 0 },
  medium: { gold: 250, ruby: 2, sapphire: 1, emerald: 0 },
  large: { gold: 1000, ruby: 4, sapphire: 2, emerald: 1 },
  huge: { gold: 3000, ruby: 6, sapphire: 4, emerald: 2 },
};

function removeCost(size: GemSize): number {
  return Math.round(INSERT_COST[size].gold / 2);
}

function socketableItems(p: PlayerStats, stats: PlayerStatsService): ItemInstance[] {
  const equippedUids = new Set(
    [p.equipped.weapon, p.equipped.armor, p.equipped.tool].filter(Boolean),
  );
  const list = stats.getItemsForPlayer(p.id).filter((it) => (it.gemSlots ?? 0) > 0);
  return list.sort((a, b) => {
    const aE = equippedUids.has(a.uid) ? 0 : 1;
    const bE = equippedUids.has(b.uid) ? 0 : 1;
    if (aE !== bE) return aE - bE;
    return a.name.localeCompare(b.name);
  });
}

export class EnchanterService {
  private readonly browsers = new Map<string, BrowserState>();

  constructor(private readonly stats: PlayerStatsService) {}

  async openFromInteraction(interaction: ButtonInteraction, cityId: string): Promise<void> {
    const userId = interaction.user.id;
    this.stats.get(userId, interaction.user.globalName || interaction.user.username);
    const state: BrowserState = {
      userId,
      cityId,
      fromMenu: true,
      index: 0,
      mode: { kind: 'browse' },
    };
    this.browsers.set(userId, state);
    await this.renderBrowser(interaction, state);
  }

  async openFromSlash(
    interaction: ChatInputCommandInteraction,
    cityId: string,
  ): Promise<void> {
    const userId = interaction.user.id;
    const player = this.stats.get(
      userId,
      interaction.user.globalName || interaction.user.username,
    );
    const state: BrowserState = {
      userId,
      cityId,
      fromMenu: false,
      index: 0,
      mode: { kind: 'browse' },
    };
    this.browsers.set(userId, state);
    const items = socketableItems(player, this.stats);
    await interaction
      .reply({
        content: this.renderContent(player, state, items),
        components: this.renderRows(player, state, items),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('ench:')) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    if (interaction.user.id !== userId) {
      await interaction
        .reply({ content: 'To nie twój enchanter.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Sesja enchantera wygasła — otwórz ponownie z menu miasta.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(userId);

    if (action === 'close') {
      this.browsers.delete(userId);
      await interaction
        .update({ content: 'Enchanter dziękuje za wizytę.', components: [] })
        .catch(() => {});
      return;
    }
    if (action === 'nav') {
      const dir = parts[3] === '-1' ? -1 : 1;
      const items = socketableItems(player, this.stats);
      if (items.length > 0) {
        state.index = (state.index + dir + items.length) % items.length;
      }
      state.lastMessage = undefined;
      state.mode = { kind: 'browse' };
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'remove') {
      const slotIdx = parseInt(parts[3], 10);
      const items = socketableItems(player, this.stats);
      const item = items[state.index];
      if (!item) {
        state.lastMessage = '🚫 Brak itemu.';
        await this.renderBrowser(interaction, state);
        return;
      }
      const result = this.tryRemove(player, item.uid, slotIdx);
      this.stats.save();
      state.lastMessage = result.line;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'pick') {
      const slotIdx = parseInt(parts[3], 10);
      state.mode = { kind: 'pick', slotIdx };
      state.lastMessage = undefined;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'cancelpick') {
      state.mode = { kind: 'browse' };
      state.lastMessage = undefined;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'insert') {
      const gemId = parts[3];
      const items = socketableItems(player, this.stats);
      const item = items[state.index];
      if (!item || state.mode.kind !== 'pick') {
        state.lastMessage = '🚫 Brak itemu lub slotu.';
        state.mode = { kind: 'browse' };
        await this.renderBrowser(interaction, state);
        return;
      }
      const result = this.tryInsert(player, item.uid, state.mode.slotIdx, gemId);
      this.stats.save();
      state.lastMessage = result.line;
      state.mode = { kind: 'browse' };
      await this.renderBrowser(interaction, state);
      return;
    }
  }

  tryInsert(
    p: PlayerStats,
    uid: string,
    slotIdx: number,
    gemId: string,
  ): { ok: boolean; line: string } {
    const item = this.stats.findItem(p, uid);
    if (!item || !item.gemSlots) return { ok: false, line: '🚫 Item nie ma slotów.' };
    if (slotIdx < 0 || slotIdx >= item.gemSlots) {
      return { ok: false, line: '🚫 Niewłaściwy index slotu.' };
    }
    if (!item.gems) item.gems = new Array(item.gemSlots).fill(null);
    if (item.gems[slotIdx]) {
      return { ok: false, line: '🚫 Slot zajęty — najpierw wyjmij gem.' };
    }
    const parsed = parseGemId(gemId);
    if (!parsed) return { ok: false, line: '🚫 Nieznany gem.' };
    if ((p.inventory.resources[gemId] ?? 0) < 1) {
      return { ok: false, line: `🚫 Nie masz gemu \`${gemId}\`.` };
    }
    const cost = INSERT_COST[parsed.size];
    const matCheck = this.checkMaterials(p, cost);
    if (matCheck) return matCheck;

    this.stats.removeGold(p, cost.gold);
    this.stats.removeResource(p, gemId, 1);
    if (cost.ruby > 0) this.stats.removeResource(p, ENCHANTER_MATERIAL_IDS.ruby, cost.ruby);
    if (cost.sapphire > 0)
      this.stats.removeResource(p, ENCHANTER_MATERIAL_IDS.sapphire, cost.sapphire);
    if (cost.emerald > 0)
      this.stats.removeResource(p, ENCHANTER_MATERIAL_IDS.emerald, cost.emerald);
    item.gems[slotIdx] = gemId;
    return {
      ok: true,
      line: `✅ Włożono **${ITEMS[gemId]?.name ?? gemId}** do slotu **${slotIdx + 1}** w **${item.name}**. Koszt: ${cost.gold}g${cost.ruby ? ` + ${cost.ruby}🔴` : ''}${cost.sapphire ? ` + ${cost.sapphire}🔵` : ''}${cost.emerald ? ` + ${cost.emerald}🟢` : ''}.`,
    };
  }

  tryRemove(
    p: PlayerStats,
    uid: string,
    slotIdx: number,
  ): { ok: boolean; line: string } {
    const item = this.stats.findItem(p, uid);
    if (!item || !item.gemSlots) return { ok: false, line: '🚫 Item nie ma slotów.' };
    const gemId = item.gems?.[slotIdx];
    if (!gemId) return { ok: false, line: '🚫 Slot pusty.' };
    const parsed = parseGemId(gemId);
    if (!parsed) return { ok: false, line: '🚫 Nieznany gem w slocie.' };
    const cost = removeCost(parsed.size);
    if (p.gold < cost) {
      return {
        ok: false,
        line: `🚫 Brak złota — potrzeba **${cost}g**, masz ${p.gold}g.`,
      };
    }
    this.stats.removeGold(p, cost);
    this.stats.addResource(p, gemId, 1);
    item.gems![slotIdx] = null;
    return {
      ok: true,
      line: `✅ Wyjęto **${ITEMS[gemId]?.name ?? gemId}** ze slotu **${slotIdx + 1}** w **${item.name}** za ${cost}g. Gem wraca do plecaka.`,
    };
  }

  /** Walidacja materiałów (ruby/sapphire/emerald) przed deduktem. Zwraca pierwszy braking. */
  private checkMaterials(
    p: PlayerStats,
    cost: { gold: number; ruby: number; sapphire: number; emerald: number },
  ): { ok: boolean; line: string } | null {
    if (p.gold < cost.gold) {
      return {
        ok: false,
        line: `🚫 Brak złota — potrzeba **${cost.gold}g**, masz ${p.gold}g.`,
      };
    }
    const checks: Array<{ id: string; need: number; label: string }> = [
      { id: ENCHANTER_MATERIAL_IDS.ruby, need: cost.ruby, label: 'rubinów' },
      { id: ENCHANTER_MATERIAL_IDS.sapphire, need: cost.sapphire, label: 'szafirów' },
      { id: ENCHANTER_MATERIAL_IDS.emerald, need: cost.emerald, label: 'szmaragdów' },
    ];
    for (const c of checks) {
      if (c.need <= 0) continue;
      const have = p.inventory.resources[c.id] ?? 0;
      if (have < c.need) {
        return {
          ok: false,
          line: `🚫 Brak ${c.label} — potrzeba **${c.need}**, masz ${have}.`,
        };
      }
    }
    return null;
  }

  private async renderBrowser(
    interaction: ButtonInteraction,
    state: BrowserState,
  ): Promise<void> {
    const player = this.stats.get(state.userId);
    const items = socketableItems(player, this.stats);
    await interaction
      .update({
        content: this.renderContent(player, state, items),
        components: this.renderRows(player, state, items),
      })
      .catch(() => {});
  }

  private renderContent(
    p: PlayerStats,
    state: BrowserState,
    items: ItemInstance[],
  ): string {
    const city = getCity(state.cityId);
    const ruby = p.inventory.resources[ENCHANTER_MATERIAL_IDS.ruby] ?? 0;
    const sapphire = p.inventory.resources[ENCHANTER_MATERIAL_IDS.sapphire] ?? 0;
    const emerald = p.inventory.resources[ENCHANTER_MATERIAL_IDS.emerald] ?? 0;
    const header = `💎 **Enchanter w ${city?.name ?? state.cityId}** — 💰 **${p.gold}g** · 🔴 ${ruby} rubinów · 🔵 ${sapphire} szafirów · 🟢 ${emerald} szmaragdów`;
    if (items.length === 0) {
      return `${header}\n\n_Nie masz żadnych itemów ze slotami na gemy. Drop-y z dungeonów/bossów/ekspedycji (T2+) z rarity uncommon+ mają sloty po identyfikacji._`;
    }
    if (state.index >= items.length) state.index = 0;
    const item = items[state.index];
    const lines: string[] = [
      header,
      '',
      state.lastMessage ?? '',
      `📦 **[${state.index + 1}/${items.length}]** ${fmtInstance(item)}`,
    ];
    const slots: string[] = [];
    for (let i = 0; i < (item.gemSlots ?? 0); i++) {
      const gemId = item.gems?.[i];
      if (gemId) slots.push(`  Slot ${i + 1}: 💎 ${ITEMS[gemId]?.name ?? gemId}`);
      else slots.push(`  Slot ${i + 1}: ⚪ _(pusty)_`);
    }
    lines.push('', '**Sloty:**', ...slots);
    if (state.mode.kind === 'pick') {
      lines.push(
        '',
        `🔧 **Wybierz gem do slotu ${state.mode.slotIdx + 1}** _(potrzeba 🔴 rubinów / 🔵 szafirów / 🟢 szmaragdów + złoto wg rozmiaru):_`,
        '_small:_ 60g+1🔴 · _medium:_ 250g+2🔴+1🔵 · _large:_ 1000g+4🔴+2🔵+1🟢 · _huge:_ 3000g+6🔴+4🔵+2🟢',
      );
    } else {
      lines.push(
        '',
        '_Klik **➕ Slot N** żeby wstawić gem · klik **❌ Slot N** żeby wyjąć (½ kosztu wstawiania)._',
      );
    }
    return lines.filter(Boolean).join('\n').slice(0, 1900);
  }

  private renderRows(p: PlayerStats, state: BrowserState, items: ItemInstance[]) {
    if (items.length === 0) {
      return buildEnchanterBrowseRows({
        userId: state.userId,
        itemsCount: 0,
        slots: [],
        fromMenu: state.fromMenu,
      });
    }
    const item = items[state.index];
    if (state.mode.kind === 'pick') {
      const gemCounts: Record<string, number> = {};
      for (const size of SIZES) {
        for (const elem of ['fire', 'ice', 'poison'] as const) {
          const id = `gem_${elem}_${size}`;
          gemCounts[id] = p.inventory.resources[id] ?? 0;
        }
      }
      return buildEnchanterGemPickerRows({
        userId: state.userId,
        gemCounts,
      });
    }
    const slots: { idx: number; filled: boolean }[] = [];
    for (let i = 0; i < (item.gemSlots ?? 0); i++) {
      slots.push({ idx: i, filled: !!item.gems?.[i] });
    }
    return buildEnchanterBrowseRows({
      userId: state.userId,
      itemsCount: items.length,
      slots,
      fromMenu: state.fromMenu,
    });
  }
}
