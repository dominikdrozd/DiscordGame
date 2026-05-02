import type { Client, ButtonInteraction } from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { PartyService, type Party } from '../services/party.js';
import { rollLootMany } from '../services/loot.js';
import { ITEMS } from '../services/items.js';
import { EXPEDITIONS, type ExpeditionDef } from './encounters.js';
import { randomAmbushMob, ambushTierForLevel, type RandomAmbushOpts } from '../mobs/index.js';
import { errMsg } from '../../../utils.js';

function buildAmbushOpts(def: ExpeditionDef | undefined, combatLvl: number): RandomAmbushOpts {
  const opts: RandomAmbushOpts = {};
  if (def?.ambushMobIds && def.ambushMobIds.length > 0) {
    opts.allowedIds = [...def.ambushMobIds];
  }
  if (def?.ambushTiers && def.ambushTiers.length > 0) {
    opts.allowedTiers = [...def.ambushTiers];
  } else {
    opts.tier = ambushTierForLevel(combatLvl);
  }
  return opts;
}
import {
  type BattleCombatant,
  type BattleState,
  aliveEnemies,
  findCombatant,
  humansAlive,
} from './battle-state.js';
import { resolveBattleRound } from './combat-battle.js';
import { chooseAiAction } from './ai.js';
import { buildPlayerCombatant } from './player-combatant.js';
import { buildActionRow, buildTargetRow } from '../ui/battle-buttons.js';
import {
  openItemPicker,
  recordItemPick,
  syncConsumablesAfterBattle,
  openSkillPicker,
  handleSkillPick,
  handleSkillTarget,
  ackStaleInteraction,
} from './battle-helpers.js';

const AMBUSH_CHECK_INTERVAL_MS = parseInt(process.env.AMBUSH_CHECK_INTERVAL_MS || '300000', 10);
const AMBUSH_CHANCE = parseFloat(process.env.AMBUSH_CHANCE || '0.25');
const AMBUSH_TIMEOUT_MS = 10 * 60_000;

interface AmbushBattleState extends BattleState {
  expedition: { destination: string; channelId: string };
  timeoutHandle?: NodeJS.Timeout;
}

export class AmbushService {
  private timer: NodeJS.Timeout | null = null;
  private readonly visited = new Set<string>();
  private readonly states = new Map<string, AmbushBattleState>();

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.error('[ambush] tick fail:', errMsg(e)));
    }, AMBUSH_CHECK_INTERVAL_MS);
    this.timer.unref?.();
    console.log(
      `[ambush] loop started (every ${AMBUSH_CHECK_INTERVAL_MS / 1000}s, chance ${AMBUSH_CHANCE})`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    const id = interaction.customId;
    const battleId = id.split(':')[1];
    if (!this.states.has(battleId)) return;
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

  private async tick(): Promise<void> {
    const now = Date.now();
    const handledParties = new Set<string>();
    for (const player of this.stats.list()) {
      const exp = player.activeExpedition;
      if (!exp || !exp.channelId) continue;
      if (exp.endsAt <= now) continue;
      // dedupe per party
      if (exp.partyId) {
        if (handledParties.has(exp.partyId)) continue;
        handledParties.add(exp.partyId);
      }
      const visitKey = `${exp.partyId ?? player.id}:${exp.endsAt}:${Math.floor(now / AMBUSH_CHECK_INTERVAL_MS)}`;
      if (this.visited.has(visitKey)) continue;
      if (Math.random() > AMBUSH_CHANCE) continue;
      this.visited.add(visitKey);
      if (exp.partyId) {
        const party = this.party.get(exp.partyId);
        if (party) await this.triggerPartyAmbush(party);
      } else {
        await this.triggerAmbush(player.id);
      }
    }
  }

  private async triggerPartyAmbush(party: Party): Promise<void> {
    const members = party.members
      .map((id) => this.stats.get(id))
      .filter((p) => p.activeExpedition && p.activeExpedition.channelId);
    if (members.length === 0) return;
    const channelId = members[0].activeExpedition!.channelId!;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const announcement = await channel
      .send(
        `🏹 ${members.map((m) => `<@${m.id}>`).join(' ')} — z krzaków wyskakuje banda — broń się!`,
      )
      .catch(() => null);
    if (!announcement) return;
    const thread = await announcement
      .startThread({
        name: `Ambush: party (${members.length})`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch(() => null);
    if (!thread) return;

    const playerCombatants: BattleCombatant[] = members.map((p) => ({
      ...buildPlayerCombatant(this.stats, p),
      team: 0,
      controller: 'human',
    }));
    const mobCount = Math.min(4, members.length);
    const maxCombatLvl = Math.max(...members.map((m) => m.skills.combat.level));
    const expDef = EXPEDITIONS[members[0].activeExpedition!.destination];
    const mobCombatants: BattleCombatant[] = [];
    for (let i = 0; i < mobCount; i++) {
      const mob = randomAmbushMob(buildAmbushOpts(expDef, maxCombatLvl));
      const raw = mob.toCombatant(`${Date.now()}_${i + 1}`);
      mobCombatants.push({
        ...raw,
        team: 1,
        controller: 'ai',
      });
    }

    const expDestination = members[0].activeExpedition!.destination;
    const state: AmbushBattleState = {
      id: thread.id,
      thread,
      combatants: [...playerCombatants, ...mobCombatants],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      expedition: { destination: expDestination, channelId },
    };
    this.states.set(thread.id, state);

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) =>
        console.error('[ambush] party timeout fail:', errMsg(e)),
      );
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    const mobLine = mobCombatants.map((m) => `**${m.name}** (${m.hp} HP)`).join(', ');
    await thread.send(
      `Wrogowie: ${mobLine}. Każdy członek party klika dla siebie — runda się rozliczy gdy wszyscy podadzą akcje. ${AMBUSH_TIMEOUT_MS / 60_000} min na całość.`,
    );
    await this.promptHumans(state);
  }

  private async triggerAmbush(playerId: string): Promise<void> {
    const player = this.stats.get(playerId);
    const exp = player.activeExpedition;
    if (!exp?.channelId) return;
    const channel = await this.client.channels.fetch(exp.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const announcement = await channel
      .send(`🏹 <@${playerId}> Z krzaków wyskakuje napastnik — broń się!`)
      .catch(() => null);
    if (!announcement) return;

    let thread: any;
    try {
      thread = await announcement.startThread({
        name: `Ambush: ${player.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
    } catch {
      return;
    }
    if (!thread) return;

    const playerRaw = buildPlayerCombatant(this.stats, player);
    const playerCombatant: BattleCombatant = {
      ...playerRaw,
      team: 0,
      controller: 'human',
    };
    const expDef = EXPEDITIONS[exp.destination];
    const mob = randomAmbushMob(buildAmbushOpts(expDef, player.skills.combat.level));
    const mobCombatant: BattleCombatant = {
      ...mob.toCombatant(`${Date.now()}`),
      team: 1,
      controller: 'ai',
    };

    const state: AmbushBattleState = {
      id: thread.id,
      thread,
      combatants: [playerCombatant, mobCombatant],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      expedition: { destination: exp.destination, channelId: exp.channelId },
    };
    this.states.set(thread.id, state);

    state.timeoutHandle = setTimeout(() => {
      this.timeoutAmbush(state).catch((e) => console.error('[ambush] timeout fail:', errMsg(e)));
    }, AMBUSH_TIMEOUT_MS);
    state.timeoutHandle.unref?.();

    await thread.send(
      `**${mobCombatant.name}** (${mobCombatant.hp} HP, +${mobCombatant.damageBonus} dmg) blokuje Ci drogę! Masz ${AMBUSH_TIMEOUT_MS / 60_000} min na walkę — w przeciwnym razie wyprawa pada.`,
    );
    await this.promptHumans(state);
  }

  private async handleAction(interaction: ButtonInteraction): Promise<void> {
    const [, battleId, combatantId, kind] = interaction.customId.split(':');
    const state = this.states.get(battleId);
    if (!state || state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction.reply({ content: 'To nie twój ambush.', ephemeral: true }).catch(() => {});
      return;
    }
    const me = findCombatant(state, combatantId);
    if (!me || me.hp <= 0) {
      await interaction
        .reply({ content: 'Już nie żyjesz w tym ambushu.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (state.pending.has(combatantId)) {
      await interaction.reply({ content: 'Już wybrałeś.', ephemeral: true }).catch(() => {});
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
        await interaction.update({ content: 'Cel padł.', components: [] }).catch(() => {});
        return;
      }
      state.pending.set(combatantId, { kind: 'attack', targetId });
      await interaction
        .update({ content: `Wybrany: **${target.name}**.`, components: [] })
        .catch(() => {});
    } else {
      await interaction
        .update({ content: `Nieznany kind \`${kind}\`.`, components: [] })
        .catch(() => {});
      return;
    }
    await this.maybeResolve(state);
  }

  private async maybeResolve(state: AmbushBattleState): Promise<void> {
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
      await this.finishAmbush(state, result);
      return;
    }

    await state.thread.send(
      [...result.lines, '', this.fmtBoard(state), `⏭ Runda ${state.roundNumber}`].join('\n'),
    );
    await this.promptHumans(state);
  }

  private async finishAmbush(
    state: AmbushBattleState,
    result: { draw?: boolean; winnerTeam?: number },
  ): Promise<void> {
    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
    syncConsumablesAfterBattle(this.stats, state);
    const playerCombatants = state.combatants.filter((c) => c.team === 0);
    const def = EXPEDITIONS[state.expedition.destination];

    if (result.draw || result.winnerTeam === 1) {
      for (const pc of playerCombatants) {
        const p = this.stats.get(pc.id, pc.name);
        p.activeExpedition = null;
      }
      this.stats.save();
      await state.thread.send(
        `💀 Druzyna pada! Wyprawa do **${def?.name ?? state.expedition.destination}** przepada dla wszystkich.`,
      );
    } else {
      const lines: string[] = ['🏆 Banda pokonana! Łupy:'];
      for (const pc of playerCombatants) {
        const p = this.stats.get(pc.id, pc.name);
        const drops = def?.lootTable ? rollLootMany(def.lootTable, p.skills.combat.level, 1) : [];
        const dropLabels: string[] = [];
        for (const d of drops) {
          this.stats.addResource(p, d.itemId, d.qty);
          dropLabels.push(`${ITEMS[d.itemId]?.name ?? d.itemId} ×${d.qty}`);
        }
        const leveled = this.stats.addSkillXp(p, 'combat', 25);
        lines.push(
          `• <@${p.id}>: ${dropLabels.length ? dropLabels.join(', ') : '(nic)'} (+25 XP combat${leveled ? ' 🎉 LEVEL UP!' : ''})`,
        );
      }
      lines.push('Wyprawa kontynuowana.');
      this.stats.save();
      await state.thread.send(lines.join('\n').slice(0, 1900));
    }
    this.states.delete(state.id);
  }

  private async timeoutAmbush(state: AmbushBattleState): Promise<void> {
    if (state.finished) return;
    state.finished = true;
    for (const pc of state.combatants.filter((c) => c.team === 0)) {
      const p = this.stats.get(pc.id, pc.name);
      p.activeExpedition = null;
    }
    this.stats.save();
    await state.thread
      .send(
        `⏰ Brak akcji w czasie — wyprawa pada (auto-fail po ${AMBUSH_TIMEOUT_MS / 60_000} min).`,
      )
      .catch(() => {});
    this.states.delete(state.id);
  }

  private async promptHumans(state: AmbushBattleState): Promise<void> {
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

  private fmtBoard(state: AmbushBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (mikstury: ${c.potionsLeft})` : ''}`,
      )
      .join(' | ');
  }
}
