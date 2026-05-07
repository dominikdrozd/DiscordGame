import { randomUUID } from 'node:crypto';
import {
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import {
  type BattleCombatant,
  type BattleState,
  humansAlive,
} from '../engine/battle-state.js';
import type { Client } from 'discord.js';
import { resolveBattleRound } from '../engine/combat-battle.js';
import { BattleStore } from '../engine/battle-store.js';
import { recreateBattleThread } from '../engine/battle-helpers.js';
import { chooseAiAction } from '../engine/ai.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
} from '../engine/battle-helpers.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import { awardReward } from './reward.service.js';
import { buildPanelOpenerRow } from '../ui/battle-buttons.js';
import { buildBossBrowseRows } from '../ui/boss-buttons.js';
import { ITEMS } from './items.js';
import { awardGemDrops, fmtGemDropChances } from './gem-effects.js';
import { SKILLS } from '../skills/index.js';
import { QuestService } from './quest.service.js';
import { type Mob } from '../mobs/index.js';
import { displayName, errMsg } from '../../../utils.js';

interface BossBattleState extends BattleState {
  bossId: string;
}

import { hasThreadCreate } from '../engine/discord-helpers.js';

interface BrowserState {
  userId: string;
  index: number;
  /** Czy browser pochodzi z `menu:boss` — wtedy dodajemy ← Menu row. */
  fromMenu: boolean;
}

const COOLDOWN_MS = 5 * 60_000;
/** Boss mnożnik ×3.5 — zgodnie z dungeon. /boss to też raid-tier walka. */
const BOSS_MULT = 3.5;

function scaleStat(v: number | undefined, mult: number): number | undefined {
  return v === undefined ? undefined : Math.round(v * mult);
}

function sortedBosses(): Mob[] {
  return Object.values(BOSS_MOBS).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.name.localeCompare(b.name);
  });
}

export class BossService {
  private readonly states = new Map<string, BossBattleState>();
  private readonly browsers = new Map<string, BrowserState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly battleStore: BattleStore,
    private readonly quests?: QuestService,
  ) {}

  /** Zwraca aktywny boss state gracza (jeśli jest). */
  getActiveStateForPlayer(playerId: string): BossBattleState | undefined {
    for (const state of this.states.values()) {
      if (state.finished) continue;
      if (state.combatants.some((c) => c.team === 0 && c.id === playerId && c.hp > 0)) {
        return state;
      }
    }
    return undefined;
  }

  /** Resume walki z bossem dla gracza — recreate thread jeśli zniknął. */
  async resumeForPlayer(
    client: Client,
    playerId: string,
  ): Promise<{ ok: boolean; threadId?: string }> {
    const state = this.getActiveStateForPlayer(playerId);
    if (!state) return { ok: false };

    const opts = {
      threadName: `Boss (resume): ${state.bossId}`,
      announceText: `👹 <@${playerId}> — wątek z bossem odtworzony, kontynuuj walkę!`,
    };

    if (state.thread === null) {
      const newThread = await recreateBattleThread(client, state, opts);
      return this.attachNewThread(state, newThread, playerId);
    }

    try {
      if (typeof state.thread.setArchived === 'function') {
        await state.thread.setArchived(false).catch(() => {});
      }
      await state.thread.send(`👹 <@${playerId}> wraca do walki z bossem.`);
      await promptHumansWithPanel(state);
      return { ok: true, threadId: state.thread.id };
    } catch {
      const newThread = await recreateBattleThread(client, state, opts);
      return this.attachNewThread(state, newThread, playerId);
    }
  }

  private async attachNewThread(
    state: BossBattleState,
    newThread: unknown,
    playerId: string,
  ): Promise<{ ok: boolean; threadId?: string }> {
    if (!newThread || typeof newThread !== 'object' || !('id' in newThread)) {
      return { ok: false };
    }
    const tid = (newThread as { id: string }).id;
    this.states.delete(state.id);
    state.id = tid;
    state.thread = newThread;
    state.promptMessageIds.clear();
    this.states.set(tid, state);
    await this.battleStore.updateThreadId(state._battleId, tid);
    try {
      await state.thread.send(`👹 <@${playerId}> wraca do walki z bossem.`);
      await promptHumansWithPanel(state);
    } catch {
      return { ok: false };
    }
    return { ok: true, threadId: tid };
  }

  /** Wczytuje aktywne walki z bossami na starcie. */
  async hydrate(): Promise<void> {
    const loaded = await this.battleStore.loadActive();
    let restored = 0;
    for (const { state, doc } of loaded) {
      if (doc.type !== 'boss' || !doc.bossContext) continue;
      const bossState = state as BossBattleState;
      bossState.bossId = doc.bossContext.bossId;
      bossState.parentChannelId = doc.parentChannelId;
      this.states.set(state.id, bossState);
      restored += 1;
    }
    console.log(`[boss] hydrate: ${restored} active boss battles restored`);
  }

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, prompt, registerThread } = ctx;

    if (!prompt) {
      const lines = [`👹 **Bossowie** _(raid-tier ×${BOSS_MULT}):_`];
      for (const b of sortedBosses()) {
        const c = b.toCombatant();
        const hp = Math.round(c.hp * BOSS_MULT);
        const dmg = Math.round(c.damageBonus * BOSS_MULT);
        lines.push(
          `• \`${b.id}\` (T${b.tier}) — **${b.name}** (${hp} HP, +${dmg} dmg) — ${b.description}`,
        );
      }
      lines.push('', 'Użycie: `.boss <id>` lub `.menu` → 👹 Bossowie (interaktywny browser).');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    const def = BOSS_MOBS[prompt];
    if (!def) {
      await msg.reply(`Nie ma bossa \`${prompt}\`. Wpisz \`.boss\` żeby zobaczyć listę.`);
      return;
    }

    const player = this.stats.get(msg.author.id, displayName(msg));
    if (player.activeExpedition) {
      await msg.reply('🚫 Jesteś na wyprawie — bossowie niedostępni. Dokończ wyprawę najpierw.');
      return;
    }
    const cooldownMsg = this.cooldownReason(player);
    if (cooldownMsg) {
      await msg.reply(cooldownMsg);
      return;
    }

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Boss: ${player.name} vs ${def.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await msg.reply(`Nie udało się otworzyć wątku: ${errMsg(e)}`);
      return;
    }
    await this.startBattle(thread, player, def);
  }

  /** Browser bossów wywołany z `menu:boss` — ◀/▶ + opis + Atakuj + ← Menu. */
  async openFromInteraction(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;
    const player = this.stats.get(userId, userName);
    if (player.activeExpedition) {
      await interaction
        .update({
          content: '🚫 Jesteś na wyprawie — bossowie niedostępni. Dokończ wyprawę najpierw.',
          components: [],
        })
        .catch(() => {});
      return;
    }
    const bosses = sortedBosses();
    if (bosses.length === 0) {
      await interaction.update({ content: 'Brak bossów.', components: [] }).catch(() => {});
      return;
    }
    const state: BrowserState = { userId, index: 0, fromMenu: true };
    this.browsers.set(userId, state);
    await this.renderBrowser(interaction, state);
  }

  /**
   * Browser bossów z slash command `/boss` — pierwsza odpowiedź to ephemeral
   * reply (zamiast update). Bez ← Menu rowu (slash nie ma menu skąd wracać).
   */
  async openFromSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;
    const player = this.stats.get(userId, userName);
    if (player.activeExpedition) {
      await interaction
        .reply({
          content: '🚫 Jesteś na wyprawie — bossowie niedostępni. Dokończ wyprawę najpierw.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const bosses = sortedBosses();
    if (bosses.length === 0) {
      await interaction
        .reply({ content: 'Brak bossów.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const state: BrowserState = { userId, index: 0, fromMenu: false };
    this.browsers.set(userId, state);
    const def = bosses[state.index];
    const canFight = !this.cooldownReason(player);
    await interaction
      .reply({
        content: this.renderBossDetails(def, player),
        components: buildBossBrowseRows(state.userId, bosses.length, canFight, false),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  private cooldownReason(player: PlayerStats): string | null {
    const remaining = this.stats.remainingCooldown(player, 'boss');
    if (remaining > 0) return `Boss-cooldown: jeszcze ${Math.ceil(remaining / 1000)} s.`;
    return null;
  }

  private renderBossDetails(def: Mob, player: PlayerStats): string {
    const c = def.toCombatant();
    const hp = Math.round(c.hp * BOSS_MULT);
    const dmg = Math.round(c.damageBonus * BOSS_MULT);
    const defBonus =
      c.defenseBonus !== undefined ? Math.round(c.defenseBonus * BOSS_MULT) : undefined;
    const lines: string[] = [
      `👹 **${def.name}** (Tier ${def.tier}) — _raid-tier ×${BOSS_MULT}_`,
      `_${def.description}_`,
      '',
      `🩸 HP: **${hp}** · ⚔️ Dmg: **+${dmg}**` +
        (defBonus !== undefined ? ` · 🛡️ Def: **+${defBonus}**` : '') +
        (c.critBonus !== undefined ? ` · 💥 Crit: **${(c.critBonus * 100).toFixed(0)}%**` : '') +
        (c.potionsLeft > 0 ? ` · 🧪 Potki: **${c.potionsLeft}**` : ''),
    ];
    if (def.skills.length > 0) {
      lines.push(`✨ Skille: ${def.skills.join(', ')}`);
    }
    if (def.rewards) {
      const scaledXp = Math.round(def.rewards.xp * BOSS_MULT);
      const scaledCombatXp = def.rewards.combatXp
        ? Math.round(def.rewards.combatXp * BOSS_MULT)
        : 0;
      lines.push('', '**Nagrody (skalowane):**');
      lines.push(`• +${scaledXp} XP PvP` + (scaledCombatXp ? `, +${scaledCombatXp} XP combat` : ''));
      if (def.rewards.lootTable && def.rewards.lootTable.length > 0) {
        const drops = def.rewards.lootTable
          .map((entry) => {
            const name = ITEMS[entry.itemId]?.name ?? entry.itemId;
            const qty =
              entry.qtyMin && entry.qtyMax && entry.qtyMin !== entry.qtyMax
                ? `${entry.qtyMin}-${entry.qtyMax}`
                : `${entry.qtyMin ?? 1}`;
            return `${name} ×${qty} (waga ${entry.weight})`;
          })
          .join(', ');
        lines.push(`• Loot (${def.rewards.rolls ?? 1} rolli): ${drops}`);
      }
      if (def.rewards.dropPool && def.rewards.dropPool.length > 0) {
        const pool = def.rewards.dropPool.map((id) => ITEMS[id]?.name ?? id).join(', ');
        const chance = Math.round((def.rewards.guaranteedDropChance ?? 0) * 100);
        lines.push(`• 🎁 Rzadki drop (${chance}%): ${pool}`);
      }
      if (def.rewards.bookDrops && def.rewards.bookDrops.length > 0) {
        const books = def.rewards.bookDrops
          .map((b) => {
            const skill = SKILLS[b.skillId];
            const pct = Math.round(b.chance * 100);
            return `**${skill?.name ?? b.skillId}** (${pct}%)`;
          })
          .join(', ');
        lines.push(`• 📜 Księgi super-spelli: ${books}`);
      }
    }
    if (def.tier >= 2) {
      lines.push(`• 💎 Gemy (T${def.tier}, niezależne rolle): ${fmtGemDropChances(def.tier)}`);
    }
    const cdLeft = this.stats.remainingCooldown(player, 'boss');
    if (cdLeft > 0) {
      lines.push('', `⏳ **Cooldown:** ${Math.ceil(cdLeft / 1000)}s`);
    }
    lines.push('', `🎯 \`.boss ${def.id}\` (lub kliknij **⚔️ Atakuj**)`);
    return lines.join('\n').slice(0, 1900);
  }

  private async renderBrowser(interaction: ButtonInteraction, state: BrowserState): Promise<void> {
    const bosses = sortedBosses();
    const def = bosses[state.index];
    const player = this.stats.get(state.userId);
    const canFight = !this.cooldownReason(player);
    await interaction
      .update({
        content: this.renderBossDetails(def, player),
        components: buildBossBrowseRows(state.userId, bosses.length, canFight, state.fromMenu),
      })
      .catch(() => {});
  }

  private async startBattle(thread: any, player: PlayerStats, def: Mob): Promise<void> {
    const playerCombatRaw = buildPlayerCombatant(this.stats, player);
    const playerCombatant: BattleCombatant = {
      ...playerCombatRaw,
      team: 0,
      controller: 'human',
    };
    const bossRaw = def.toCombatant();
    const scaledHp = Math.round(bossRaw.hp * BOSS_MULT);
    const bossCombatant: BattleCombatant = {
      ...bossRaw,
      id: `enemy:${def.id}`,
      hp: scaledHp,
      maxHp: scaledHp,
      damageBonus: scaleStat(bossRaw.damageBonus, BOSS_MULT) ?? 0,
      defenseBonus: scaleStat(bossRaw.defenseBonus, BOSS_MULT),
      team: 1,
      controller: 'ai',
    };

    const state: BossBattleState = {
      _battleId: randomUUID(),
      parentChannelId: thread.parentId ?? thread.id,
      id: thread.id,
      thread,
      combatants: [playerCombatant, bossCombatant],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      bossId: def.id,
    };
    this.states.set(thread.id, state);
    await this.battleStore.create(state, 'boss', {
      parentChannelId: thread.parentId ?? thread.id,
      bossContext: { bossId: state.bossId },
    });

    const bagPotion = playerCombatant.consumables?.potion_small ?? 0;
    await thread.send(
      `👹 **${def.name}** stanął przed Tobą!\n` +
        `_${def.description}_\n\n` +
        `Ty: ${playerCombatant.hp}/${playerCombatant.maxHp} HP, +${playerCombatant.damageBonus} dmg, ${bagPotion} mikstur w plecaku.\n` +
        `Boss: ${bossCombatant.hp} HP, +${bossCombatant.damageBonus} dmg, ${bossCombatant.potionsLeft} mikstur.`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (interaction.customId.startsWith('bbr:')) {
      await this.handleBrowse(interaction);
      return;
    }
    await routeBattleInteraction<BossBattleState>(interaction, {
      getState: (id) => this.states.get(id),
      onChoiceRecorded: (state) => this.maybeResolve(state),
      notMineMessage: 'To nie twoja walka.',
      alreadyDeadMessage: 'Już nie żyjesz.',
    });
  }

  private async handleBrowse(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    const arg = parts[3];

    if (interaction.user.id !== userId) {
      await interaction
        .reply({ content: 'To nie twój browser.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const state = this.browsers.get(userId);
    if (!state) {
      await interaction
        .reply({
          content: 'Browser zamknięty — wpisz `.menu` lub `.boss <id>`.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const bosses = sortedBosses();

    if (action === 'nav') {
      const dir = arg === '-1' ? -1 : 1;
      state.index = (state.index + dir + bosses.length) % bosses.length;
      await this.renderBrowser(interaction, state);
      return;
    }
    if (action === 'enter') {
      await this.handleBrowseEnter(interaction, state, bosses);
      return;
    }
    if (action === 'close') {
      this.browsers.delete(userId);
      await interaction
        .update({ content: 'Browser bossów zamknięty.', components: [] })
        .catch(() => {});
    }
  }

  private async handleBrowseEnter(
    interaction: ButtonInteraction,
    state: BrowserState,
    bosses: Mob[],
  ): Promise<void> {
    const def = bosses[state.index];
    const player = this.stats.get(state.userId);
    const cooldownMsg = this.cooldownReason(player);
    if (cooldownMsg) {
      await interaction.reply({ content: cooldownMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const channel: unknown = interaction.channel;
    if (!hasThreadCreate(channel)) {
      await interaction
        .reply({
          content: 'Nie mogę otworzyć wątku w tym kanale — użyj `.boss ' + def.id + '`.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    let thread: unknown;
    try {
      thread = await channel.threads.create({
        name: `Boss: ${player.name} vs ${def.name}`.slice(0, 100),
        autoArchiveDuration: 60,
        type: ChannelType.PublicThread,
      });
    } catch (e) {
      await interaction
        .reply({ content: `Nie udało się otworzyć wątku: ${errMsg(e)}`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    if (!thread || typeof thread !== 'object' || !('id' in thread) || typeof thread.id !== 'string') {
      await interaction
        .reply({ content: 'Wątek bossa utworzony, ale brak API.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    this.browsers.delete(state.userId);
    await interaction
      .update({
        content: `⚔️ **${def.name}** — wątek otwarty: <#${thread.id}>`,
        components: [],
      })
      .catch(() => {});
    await this.startBattle(thread, player, def);
  }

  private async maybeResolve(state: BossBattleState): Promise<void> {
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    for (const c of state.combatants) {
      if (c.controller !== 'ai' || c.hp <= 0 || state.pending.has(c.id)) continue;
      state.pending.set(c.id, chooseAiAction(state, c));
    }

    for (const [, msgId] of state.promptMessageIds) {
      try {
        const m = await state.thread.messages.fetch(msgId).catch(() => null);
        if (m)
          await m.edit({ components: [buildPanelOpenerRow(state.id, true)] }).catch(() => {});
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);
    await this.battleStore.snapshot(state);

    // Log walki — także dla ostatniej rundy (przed `finish`).
    if (result.lines.length > 0) {
      await state.thread.send(
        [...result.lines, '', this.fmtBoard(state)].join('\n').slice(0, 1900),
      );
    }

    if (result.finished) {
      await this.finish(state, result);
      return;
    }

    await state.thread.send(`⏭ Runda ${state.roundNumber}`);
    await this.promptHumans(state);
  }

  private async promptHumans(state: BossBattleState): Promise<void> {
    await promptHumansWithPanel(state);
  }

  private async finish(
    state: BossBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    await this.battleStore.finish(state._battleId, {
      winnerTeam: result.winnerTeam,
      draw: result.draw,
    });
    const playerCombatant = state.combatants.find((c) => c.team === 0)!;
    const player = this.stats.get(playerCombatant.id, playerCombatant.name);
    this.stats.setCooldown(player, 'boss', COOLDOWN_MS);

    const def = BOSS_MOBS[state.bossId];
    if (result.draw || result.winnerTeam === 1) {
      await postBattleSummary(
        state.thread,
        `👹 **Walka z bossem: ${def?.name ?? state.bossId}**\n💀 **${playerCombatant.name}** pada — boss się śmieje. Cooldown 5 min.`,
      );
    } else {
      if (!def?.rewards) {
        await postBattleSummary(
          state.thread,
          `Boss \`${state.bossId}\` nie ma zdefiniowanych nagród — bug.`,
        );
      } else {
        const bossMob = BOSS_MOBS[state.bossId];
        const tier = bossMob?.tier ?? 3;
        const scaledRewards = {
          ...def.rewards,
          xp: Math.round(def.rewards.xp * BOSS_MULT),
          combatXp:
            def.rewards.combatXp !== undefined
              ? Math.round(def.rewards.combatXp * BOSS_MULT)
              : undefined,
        };
        const award = awardReward(this.stats, player, scaledRewards, { socketable: true, tier });
        const questLines = this.quests?.onBossKilled(player, state.bossId) ?? [];
        const gemLines = awardGemDrops(this.stats, player, tier);
        await postBattleSummary(
          state.thread,
          [
            `🏆 **${def.name}** pokonany! Zwycięża **${playerCombatant.name}** (${playerCombatant.hp}/${playerCombatant.maxHp} HP).`,
            ...award.lines,
            ...(gemLines.length ? [`Gemy: ${gemLines.join(', ')}`] : []),
            ...questLines,
          ].join('\n'),
        );
      }
    }
    syncConsumablesAfterBattle(this.stats, state);
    this.stats.save();
    await closeBattleThread(state.thread, '🏁 Walka z bossem zakończona — wątek archiwizujemy.');
    this.states.delete(state.id);
  }

  private fmtBoard(state: BossBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (potki: ${c.consumables?.potion_small ?? 0})` : ''}`,
      )
      .join(' | ');
  }
}
