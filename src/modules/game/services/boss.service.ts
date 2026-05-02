import { type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from './player-stats.js';
import { POTIONS_START } from '../engine/combat.js';
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
} from '../engine/battle-helpers.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import { awardReward } from './reward.service.js';
import { buildActionRow, buildTargetRow } from '../ui/battle-buttons.js';
import { displayName, errMsg } from '../../../utils.js';

interface BossBattleState extends BattleState {
  bossId: string;
}

const COOLDOWN_MS = 5 * 60_000;

export class BossService {
  private readonly states = new Map<string, BossBattleState>();

  constructor(private readonly stats: PlayerStatsService) {}

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, prompt, registerThread } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      const lines = ['👹 **Bossowie:**'];
      const sorted = Object.values(BOSS_MOBS).sort((a, b) => a.tier - b.tier);
      for (const b of sorted) {
        const c = b.toCombatant();
        lines.push(
          `• \`${b.id}\` (T${b.tier}) — **${b.name}** (${c.hp} HP, +${c.damageBonus} dmg) — ${b.description}`,
        );
      }
      lines.push('', 'Użycie: `.boss <id>`.');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    const def = BOSS_MOBS[prompt];
    if (!def) {
      await msg.reply(`Nie ma bossa \`${prompt}\`. Wpisz \`.boss\` żeby zobaczyć listę.`);
      return;
    }

    const remaining = this.stats.remainingCooldown(player, 'boss');
    if (remaining > 0) {
      await msg.reply(`Boss-cooldown: jeszcze ${Math.ceil(remaining / 1000)} s.`);
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

    const playerCombatRaw = buildPlayerCombatant(this.stats, player);
    const playerCombatant: BattleCombatant = {
      ...playerCombatRaw,
      team: 0,
      controller: 'human',
    };
    const bossRaw = def.toCombatant();
    const bossCombatant: BattleCombatant = {
      ...bossRaw,
      id: `enemy:${def.id}`,
      team: 1,
      controller: 'ai',
    };

    const state: BossBattleState = {
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

    await thread.send(
      `👹 **${def.name}** stanął przed Tobą!\n` +
        `_${def.description}_\n\n` +
        `Ty: ${playerCombatant.hp}/${playerCombatant.maxHp} HP, +${playerCombatant.damageBonus} dmg, ${POTIONS_START} mikstur.\n` +
        `Boss: ${bossCombatant.hp} HP, +${bossCombatant.damageBonus} dmg, ${bossCombatant.potionsLeft} mikstur.`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    const id = interaction.customId;
    if (id.startsWith('bat:')) return this.handleAction(interaction);
    if (id.startsWith('tgt:')) return this.handleTarget(interaction);
    if (id.startsWith('itmpick:')) return this.handleItemPick(interaction);
    if (id.startsWith('sklpick:')) return this.handleSklPick(interaction);
    if (id.startsWith('skltgt:')) return this.handleSklTarget(interaction);
  }

  private async handleItemPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await recordItemPick(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleSklPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await handleSkillPick(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleSklTarget(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    const recorded = await handleSkillTarget(interaction, state);
    if (recorded) await this.maybeResolve(state);
  }

  private async handleAction(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction.reply({ content: 'To nie twoja walka.', ephemeral: true }).catch(() => {});
      return;
    }
    const me = findCombatant(state, combatantId);
    if (!me || me.hp <= 0) {
      await interaction.reply({ content: 'Już nie żyjesz.', ephemeral: true }).catch(() => {});
      return;
    }
    if (state.pending.has(combatantId)) {
      await interaction
        .reply({ content: 'Już wybrałeś akcję — czekamy na rozliczenie.', ephemeral: true })
        .catch(() => {});
      return;
    }

    if (kind === 'def') {
      state.pending.set(combatantId, { kind: 'defend' });
      await interaction
        .reply({ content: 'Wybrałeś: **Obrona**.', ephemeral: true })
        .catch(() => {});
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
      } else {
        const row = buildTargetRow(battleId, combatantId, 'atk', enemies);
        await interaction
          .reply({ content: 'Wybierz cel ataku:', ephemeral: true, components: [row] })
          .catch(() => {});
        return; // czekamy na klik celu
      }
    } else {
      await interaction
        .reply({ content: `Nieznana akcja \`${kind}\`.`, ephemeral: true })
        .catch(() => {});
      return;
    }

    await this.maybeResolve(state);
  }

  private async handleTarget(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind, targetId] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction.reply({ content: 'To nie twój wybór.', ephemeral: true }).catch(() => {});
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
        await interaction
          .update({ content: 'Cel już padł — wybierz innego.', components: [] })
          .catch(() => {});
        return;
      }
      state.pending.set(combatantId, { kind: 'attack', targetId });
      await interaction
        .update({ content: `Wybrany cel: **${target.name}**.`, components: [] })
        .catch(() => {});
    }

    await this.maybeResolve(state);
  }

  private async maybeResolve(state: BossBattleState): Promise<void> {
    const humans = humansAlive(state);
    if (state.pending.size < humans.length) return;

    for (const c of state.combatants) {
      if (c.controller !== 'ai' || c.hp <= 0 || state.pending.has(c.id)) continue;
      state.pending.set(c.id, chooseAiAction(state, c));
    }

    for (const [allyId, msgId] of state.promptMessageIds) {
      try {
        const m = await state.thread.messages.fetch(msgId).catch(() => null);
        if (m)
          await m.edit({ components: [buildActionRow(state.id, allyId, true)] }).catch(() => {});
      } catch {}
    }
    state.promptMessageIds.clear();

    const result = resolveBattleRound(state);

    if (result.finished) {
      await this.finish(state, result);
      return;
    }

    await state.thread.send(
      [...result.lines, '', this.fmtBoard(state), `⏭ Runda ${state.roundNumber}`].join('\n'),
    );
    await this.promptHumans(state);
  }

  private async promptHumans(state: BossBattleState): Promise<void> {
    for (const c of state.combatants) {
      if (c.controller !== 'human' || c.hp <= 0) continue;
      const hasSkills = (c.skills ?? []).length > 0;
      const sent = await state.thread.send({
        content: `<@${c.id}> — wybierz akcję:`,
        components: [buildActionRow(state.id, c.id, false, hasSkills)],
      });
      state.promptMessageIds.set(c.id, sent.id);
    }
  }

  private async finish(
    state: BossBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    const playerCombatant = state.combatants.find((c) => c.team === 0)!;
    const player = this.stats.get(playerCombatant.id, playerCombatant.name);
    this.stats.setCooldown(player, 'boss', COOLDOWN_MS);

    if (result.draw || result.winnerTeam === 1) {
      await state.thread.send(
        `💀 **${playerCombatant.name} pada!** Boss się śmieje. Cooldown 5 min.`,
      );
    } else {
      const def = BOSS_MOBS[state.bossId];
      if (!def?.rewards) {
        await state.thread.send(`Boss \`${state.bossId}\` nie ma zdefiniowanych nagród — bug.`);
      } else {
        const award = awardReward(this.stats, player, def.rewards);
        await state.thread.send(
          [
            `🏆 **${def.name}** pokonany! Zwycięża **${playerCombatant.name}** (${playerCombatant.hp}/${playerCombatant.maxHp} HP).`,
            ...award.lines,
          ].join('\n'),
        );
      }
    }
    syncConsumablesAfterBattle(this.stats, state);
    this.stats.save();
    this.states.delete(state.id);
  }

  private fmtBoard(state: BossBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (mikstury: ${c.potionsLeft})` : ''}`,
      )
      .join(' | ');
  }
}
