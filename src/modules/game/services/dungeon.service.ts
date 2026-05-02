import { type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from './player-stats.js';
import {
  type BattleCombatant,
  type BattleState,
  aliveEnemies,
  findCombatant,
  humansAlive,
} from '../engine/battle-state.js';
import { resolveBattleRound } from '../engine/combat-battle.js';
import { chooseAiAction } from '../engine/ai.js';
import {
  openItemPicker,
  recordItemPick,
  syncConsumablesAfterBattle,
  openSkillPicker,
  handleSkillPick,
  handleSkillTarget,
  ackStaleInteraction,
  closeBattleThread,
  promptHumansWithPanel,
  handlePanelOpen,
  notifyChoiceMade,
  postBattleSummary,
} from '../engine/battle-helpers.js';
import { DUNGEONS } from '../engine/encounters.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import { awardReward } from './reward.service.js';
import { buildPanelOpenerRow, buildTargetRow } from '../ui/battle-buttons.js';
import { displayName, errMsg } from '../../../utils.js';

interface DungeonBattleState extends BattleState {
  dungeonId: string;
  roomIndex: number;
  currentBossId: string;
}

const COOLDOWN_MS = 30 * 60_000;

export class DungeonService {
  private readonly states = new Map<string, DungeonBattleState>();

  constructor(private readonly stats: PlayerStatsService) {}

  /** True jeśli któryś niezakończony dungeon state ma tego gracza po team 0. */
  hasActiveFor(playerId: string): boolean {
    for (const state of this.states.values()) {
      if (state.finished) continue;
      if (state.combatants.some((c) => c.team === 0 && c.id === playerId && c.hp > 0)) return true;
    }
    return false;
  }

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, prompt, registerThread } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      const lines = ['🏰 **Dungeony:**'];
      for (const d of Object.values(DUNGEONS)) {
        lines.push(`• \`${d.id}\` — **${d.name}** (${d.rooms.length} pokojów) — ${d.description}`);
      }
      lines.push('', 'Użycie: `.dungeon <id>`.');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    const def = DUNGEONS[prompt];
    if (!def) {
      await msg.reply(`Nie ma dungeona \`${prompt}\`. Wpisz \`.dungeon\` żeby zobaczyć listę.`);
      return;
    }

    const remaining = this.stats.remainingCooldown(player, 'dungeon');
    if (remaining > 0) {
      await msg.reply(`Dungeon-cooldown: jeszcze ${Math.ceil(remaining / 1000)} s.`);
      return;
    }

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Dungeon: ${player.name} — ${def.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await msg.reply(`Nie udało się otworzyć wątku: ${errMsg(e)}`);
      return;
    }

    const playerRaw = buildPlayerCombatant(this.stats, player);
    const playerCombatant: BattleCombatant = {
      ...playerRaw,
      team: 0,
      controller: 'human',
    };
    const firstBossId = def.rooms[0];
    const firstBossMob = BOSS_MOBS[firstBossId];
    const firstBoss: BattleCombatant = {
      ...firstBossMob.toCombatant(),
      id: `enemy:${firstBossId}`,
      team: 1,
      controller: 'ai',
    };

    const state: DungeonBattleState = {
      id: thread.id,
      thread,
      combatants: [playerCombatant, firstBoss],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      dungeonId: def.id,
      roomIndex: 0,
      currentBossId: firstBossId,
    };
    this.states.set(thread.id, state);

    await thread.send(
      `🏰 **${def.name}** — wchodzisz!\n_${def.description}_\n\nPokoje: ${def.rooms.length}. Pierwszy: **${firstBossMob.name}** (${firstBoss.hp} HP).`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    const id = interaction.customId;
    if (id.startsWith('pnl:')) return this.handlePanel(interaction);
    if (id.startsWith('bat:')) return this.handleAction(interaction);
    if (id.startsWith('tgt:')) return this.handleTarget(interaction);
    if (id.startsWith('itmpick:')) return this.handleItemPick(interaction);
    if (id.startsWith('sklpick:')) return this.handleSklPick(interaction);
    if (id.startsWith('skltgt:')) return this.handleSklTarget(interaction);
  }

  private async handlePanel(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    await handlePanelOpen(interaction, state);
  }

  private async handleItemPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await recordItemPick(interaction, state);
    if (recorded) {
      await notifyChoiceMade(state, interaction.user.id);
      await this.maybeResolve(state);
    }
  }

  private async handleSklPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await handleSkillPick(interaction, state);
    if (recorded) {
      await notifyChoiceMade(state, interaction.user.id);
      await this.maybeResolve(state);
    }
  }

  private async handleSklTarget(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await handleSkillTarget(interaction, state);
    if (recorded) {
      await notifyChoiceMade(state, interaction.user.id);
      await this.maybeResolve(state);
    }
  }

  private async handleAction(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state) return; // nie moja walka — niech inny service obsłuży
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction.reply({ content: 'To nie twój dungeon.', ephemeral: true }).catch(() => {});
      return;
    }
    const me = findCombatant(state, combatantId);
    if (!me || me.hp <= 0) {
      await interaction
        .reply({ content: 'Już nie żyjesz w tym dungeonie.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (state.pending.has(combatantId)) {
      await interaction.reply({ content: 'Już wybrałeś akcję.', ephemeral: true }).catch(() => {});
      return;
    }

    let recorded = false;
    if (kind === 'def') {
      state.pending.set(combatantId, { kind: 'defend' });
      await interaction
        .reply({ content: 'Wybrałeś: **Obrona**.', ephemeral: true })
        .catch(() => {});
      recorded = true;
    } else if (kind === 'itm') {
      await openItemPicker(interaction, battleId, combatantId, me);
      return;
    } else if (kind === 'skl') {
      await openSkillPicker(interaction, battleId, combatantId, me);
      return;
    } else if (kind === 'atk') {
      const enemies = aliveEnemies(state, me);
      if (enemies.length === 0) {
        await interaction
          .reply({ content: 'Brak żywych przeciwników.', ephemeral: true })
          .catch(() => {});
        return;
      }
      if (enemies.length === 1) {
        state.pending.set(combatantId, { kind: 'attack', targetId: enemies[0].id });
        await interaction
          .reply({ content: `Atak na **${enemies[0].name}**.`, ephemeral: true })
          .catch(() => {});
        recorded = true;
      } else {
        const row = buildTargetRow(battleId, combatantId, 'atk', enemies);
        await interaction
          .reply({ content: 'Wybierz cel:', ephemeral: true, components: [row] })
          .catch(() => {});
        return;
      }
    } else {
      await interaction
        .reply({ content: `Nieznana akcja \`${kind}\`.`, ephemeral: true })
        .catch(() => {});
      return;
    }

    if (recorded) await notifyChoiceMade(state, combatantId);
    await this.maybeResolve(state);
  }

  private async handleTarget(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(':');
    const [, battleId, combatantId, kind] = parts;
    const targetId = parts.slice(4).join(':');
    const state = this.states.get(battleId);
    if (!state) return; // nie moja walka — niech inny service obsłuży
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction
        .reply({ content: 'To nie twój wybór celu.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (state.pending.has(combatantId)) {
      await interaction
        .update({ content: 'Już wybrałeś akcję wcześniej.', components: [] })
        .catch(() => {});
      return;
    }
    if (kind === 'atk') {
      const target = findCombatant(state, targetId);
      if (!target || target.hp <= 0) {
        await interaction.update({ content: 'Cel już padł.', components: [] }).catch(() => {});
        return;
      }
      state.pending.set(combatantId, { kind: 'attack', targetId });
      await interaction
        .update({ content: `Wybrany cel: **${target.name}**.`, components: [] })
        .catch(() => {});
      await notifyChoiceMade(state, combatantId);
    } else {
      await interaction
        .update({ content: `Nieznany kind \`${kind}\`.`, components: [] })
        .catch(() => {});
      return;
    }
    await this.maybeResolve(state);
  }

  private async maybeResolve(state: DungeonBattleState): Promise<void> {
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
    const lines = [...result.lines];

    if (result.finished) {
      const def = DUNGEONS[state.dungeonId];
      const playerCombat = state.combatants.find((c) => c.team === 0)!;
      const playerStats = this.stats.get(playerCombat.id, playerCombat.name);

      // gracz padł lub remis
      if (result.draw || result.winnerTeam === 1) {
        this.stats.setCooldown(playerStats, 'dungeon', COOLDOWN_MS);
        syncConsumablesAfterBattle(this.stats, state);
        this.stats.save();
        // Log walki w wątku, podsumowanie też na czat-rodzic.
        if (lines.length > 0) {
          await state.thread.send(lines.join('\n').slice(0, 1900));
        }
        await postBattleSummary(
          state.thread,
          `🏰 **${def.name}** — porażka.\n💀 **${playerCombat.name}** pada w dungeonie. Cooldown 30 min.`,
        );
        await closeBattleThread(
          state.thread,
          '🏁 Dungeon zakończony porażką — wątek archiwizujemy.',
        );
        this.states.delete(state.id);
        return;
      }

      // pokój zaliczony
      const bossDef = BOSS_MOBS[state.currentBossId];
      if (bossDef?.rewards) {
        const award = awardReward(this.stats, playerStats, bossDef.rewards);
        lines.push(
          '',
          `✅ **Pokój ${state.roomIndex + 1}/${def.rooms.length} clear!** ${bossDef.name} pokonany.`,
        );
        lines.push(...award.lines);
      } else {
        lines.push(
          '',
          `✅ **Pokój ${state.roomIndex + 1}/${def.rooms.length} clear!** ${bossDef?.name ?? state.currentBossId} pokonany.`,
        );
      }

      state.roomIndex += 1;
      if (state.roomIndex >= def.rooms.length) {
        const finalAward = awardReward(this.stats, playerStats, def.finalReward);
        this.stats.setCooldown(playerStats, 'dungeon', COOLDOWN_MS);
        syncConsumablesAfterBattle(this.stats, state);
        this.stats.save();
        if (lines.length > 0) {
          await state.thread.send(lines.join('\n').slice(0, 1900));
        }
        await postBattleSummary(
          state.thread,
          [
            `🏆 **${def.name} ukończony!** Zwycięża **${playerCombat.name}**.`,
            'Finalna nagroda:',
            ...finalAward.lines,
          ].join('\n'),
        );
        await closeBattleThread(state.thread, '🏁 Dungeon ukończony — wątek archiwizujemy.');
        this.states.delete(state.id);
        return;
      }

      const nextBossId = def.rooms[state.roomIndex];
      const nextBossMob = BOSS_MOBS[nextBossId];
      const nextBoss: BattleCombatant = {
        ...nextBossMob.toCombatant(),
        id: `enemy:${nextBossId}`,
        team: 1,
        controller: 'ai',
      };
      // resetujemy enemies — gracz zostaje z aktualnym HP
      state.combatants = state.combatants.filter((c) => c.team === 0);
      state.combatants.push(nextBoss);
      state.currentBossId = nextBossId;
      state.finished = false;
      state.winnerTeam = undefined;
      state.draw = undefined;
      this.stats.save();
      await state.thread.send(
        [
          ...lines,
          '',
          `🚪 **Pokój ${state.roomIndex + 1}/${def.rooms.length}** otwarty. Wchodzi **${nextBossMob.name}** (${nextBoss.hp} HP).`,
        ].join('\n'),
      );
      await this.promptHumans(state);
      return;
    }

    await state.thread.send(
      [...lines, '', this.fmtBoard(state), `⏭ Runda ${state.roundNumber}`].join('\n'),
    );
    await this.promptHumans(state);
  }

  private async promptHumans(state: DungeonBattleState): Promise<void> {
    await promptHumansWithPanel(state);
  }

  private fmtBoard(state: DungeonBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (potki: ${c.consumables?.potion_small ?? 0})` : ''}`,
      )
      .join(' | ');
  }
}
