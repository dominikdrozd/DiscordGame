import { randomUUID } from 'node:crypto';
import {
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { PartyService, type Party, MAX_PARTY } from './party.js';
import {
  type BattleCombatant,
  type BattleState,
  humansAlive,
} from '../engine/battle-state.js';
import { resolveBattleRound } from '../engine/combat-battle.js';
import { chooseAiAction } from '../engine/ai.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
} from '../engine/battle-helpers.js';
import { DUNGEONS, dungeonRoomTier, type DungeonDef, type BossReward } from '../engine/encounters.js';
import { BOSS_MOBS } from '../mobs/index.js';
import { awardGemDrops, fmtGemDropChances } from './gem-effects.js';
import { buildPlayerCombatant } from '../engine/player-combatant.js';
import { awardReward } from './reward.service.js';
import { buildPanelOpenerRow } from '../ui/battle-buttons.js';
import { displayName, errMsg } from '../../../utils.js';
import { hasThreadCreate } from '../engine/discord-helpers.js';

interface DungeonBattleState extends BattleState {
  dungeonId: string;
  roomIndex: number;
  currentBossId: string;
  /** Membersi party którzy weszli — używane do dystrybucji finalnych nagród. */
  partyMemberIds: string[];
}

const COOLDOWN_MS = 30 * 60_000;

/**
 * Mnożnik dla dungeonowych bossów (HP/dmg/def + nagrody). Dungeon-only —
 * world boss / forced final guardian / arena nie skalują się tym.
 * 3.5 = środek przedziału 3-4× (decyzja balansu — bossowie mają być
 * znaczącym wyzwaniem partyjnym, nie soloable).
 */
const DUNGEON_BOSS_MULT = 3.5;

function scaleStat(v: number | undefined, mult: number): number | undefined {
  return v === undefined ? undefined : Math.round(v * mult);
}

/**
 * Buduje boss-combatanta z odpowiednim tierem dla danego pokoju dungeonu.
 * Tier wyliczany przez `dungeonRoomTier(def, roomIndex)` (final room +1).
 * Po `toCombatant()` aplikujemy `DUNGEON_BOSS_MULT` do hp/dmg/def — TIER
 * MULTIPLIERS skalują z bazą moba, ten dodatkowy mnożnik daje bossom
 * dungeona wagę "boss raid" zamiast "ambush mob".
 *
 * UWAGA: instancja `BOSS_MOBS[id]` jest jedna globalnie i `setTier()` na niej
 * zostaje. Dla 2 dungeonów odpalonych równolegle z tym samym bossem to
 * problem (race condition na tier mob-a). Rozwiązanie: ustawiamy tier
 * BEZPOŚREDNIO przed `toCombatant()` synchronicznie — combatant kopiuje
 * staty (multiplied) w środku `toCombatant`, więc wynik jest niezależny od
 * późniejszych zmian `mob.tier`. Mimo to dla bezpieczeństwa zwracamy w jednym
 * synchronicznym kroku.
 */
function buildDungeonBoss(def: DungeonDef, roomIndex: number, suffix: string): BattleCombatant {
  const bossId = def.rooms[roomIndex];
  const mob = BOSS_MOBS[bossId];
  if (!mob) throw new Error(`Unknown boss "${bossId}" in dungeon "${def.id}"`);
  const tier = dungeonRoomTier(def, roomIndex);
  mob.setTier(tier);
  const base = mob.toCombatant(suffix);
  const hp = Math.round(base.hp * DUNGEON_BOSS_MULT);
  return {
    ...base,
    id: `enemy:${bossId}:${suffix}`,
    hp,
    maxHp: hp,
    damageBonus: scaleStat(base.damageBonus, DUNGEON_BOSS_MULT) ?? 0,
    defenseBonus: scaleStat(base.defenseBonus, DUNGEON_BOSS_MULT),
    team: 1,
    controller: 'ai',
  };
}

/** XP/combatXp scale × `DUNGEON_BOSS_MULT`; loot/dropPool/bookDrops bez zmian. */
function scaleDungeonReward(reward: BossReward): BossReward {
  return {
    ...reward,
    xp: Math.round(reward.xp * DUNGEON_BOSS_MULT),
    combatXp:
      reward.combatXp !== undefined
        ? Math.round(reward.combatXp * DUNGEON_BOSS_MULT)
        : undefined,
  };
}


function buildSuffix(): string {
  return `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export interface DungeonStartCheck {
  ok: boolean;
  reason?: string;
  party?: Party;
}

export class DungeonService {
  private readonly states = new Map<string, DungeonBattleState>();

  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}

  /** True jeśli któryś niezakończony dungeon state ma tego gracza po team 0. */
  hasActiveFor(playerId: string): boolean {
    for (const state of this.states.values()) {
      if (state.finished) continue;
      if (state.combatants.some((c) => c.team === 0 && c.id === playerId && c.hp > 0)) return true;
    }
    return false;
  }

  /**
   * Walidacja party + dungeon-specific gating. Wywoływana z slash i text
   * command przed otwieraniem wątku.
   *
   * Sprawdza: gracz ma party, jest liderem, party >= minPartySize, każdy
   * member ma combat lvl, każdy member nie ma activeExpedition / cooldown.
   */
  canStart(playerId: string, def: DungeonDef): DungeonStartCheck {
    const partyEntity = this.party.getByMember(playerId);
    if (!partyEntity) {
      return {
        ok: false,
        reason: `🚫 Dungeony są **party-only**. Załóż party (\`/party create\`) i zaproś min. ${def.minPartySize - 1} ${def.minPartySize === 2 ? 'osobę' : 'osób'}.`,
      };
    }
    if (partyEntity.leaderId !== playerId) {
      return { ok: false, reason: 'Tylko **lider** party może rozpocząć dungeon.' };
    }
    if (partyEntity.members.length < def.minPartySize) {
      return {
        ok: false,
        reason: `🚫 **${def.name}** wymaga min. ${def.minPartySize} graczy w party (masz ${partyEntity.members.length}).`,
      };
    }
    const requiredLvl = def.requiredCombatLevel ?? 1;
    for (const memberId of partyEntity.members) {
      const member = this.stats.get(memberId);
      if (member.skills.combat.level < requiredLvl) {
        return {
          ok: false,
          reason: `🚫 **${member.name}** ma combat lvl ${member.skills.combat.level}, dungeon wymaga **${requiredLvl}**.`,
        };
      }
      if (member.activeExpedition) {
        return {
          ok: false,
          reason: `🚫 **${member.name}** jest na wyprawie — wszyscy członkowie muszą być wolni.`,
        };
      }
      const cd = this.stats.remainingCooldown(member, 'dungeon');
      if (cd > 0) {
        return {
          ok: false,
          reason: `🚫 **${member.name}** ma dungeon-cooldown: jeszcze ${Math.ceil(cd / 1000)} s.`,
        };
      }
      if (this.hasActiveFor(member.id)) {
        return {
          ok: false,
          reason: `🚫 **${member.name}** jest już w innym dungeonie.`,
        };
      }
    }
    return { ok: true, party: partyEntity };
  }

  /** Slash `/dungeon id:<id>` — ephemeral confirm + public thread z walką. */
  async startFromSlash(interaction: ChatInputCommandInteraction, dungeonId: string): Promise<void> {
    const def = DUNGEONS[dungeonId];
    if (!def) {
      await interaction
        .reply({
          content: `Nie ma dungeona \`${dungeonId}\`. Wpisz \`/dungeon\` żeby zobaczyć listę.`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const check = this.canStart(player.id, def);
    if (!check.ok || !check.party) {
      await interaction
        .reply({ content: check.reason ?? 'Nie można rozpocząć.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const channel: unknown = interaction.channel;
    if (!hasThreadCreate(channel)) {
      await interaction
        .reply({
          content: 'Ten kanał nie wspiera wątków — użyj `.dungeon <id>` w innym kanale.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    let thread: unknown;
    try {
      thread = await channel.threads.create({
        name: `Dungeon: ${def.name}`.slice(0, 100),
        autoArchiveDuration: 60,
        type: ChannelType.PublicThread,
      });
    } catch (e) {
      await interaction
        .editReply({ content: `Nie udało się otworzyć wątku: ${errMsg(e)}` })
        .catch(() => {});
      return;
    }
    if (!thread || typeof thread !== 'object' || !('id' in thread) || typeof thread.id !== 'string') {
      await interaction
        .editReply({ content: 'Wątek utworzony, ale brak API.' })
        .catch(() => {});
      return;
    }
    await this.startBattleInThread(thread, check.party, def);
    await interaction
      .editReply({ content: `🏰 Dungeon otwarty: <#${thread.id}>` })
      .catch(() => {});
  }

  async start(ctx: ICommandContext): Promise<void> {
    const { msg, prompt, registerThread } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));

    if (!prompt) {
      const lines = ['🏰 **Dungeony:** _(wszystkie party-only, każdy pokój rzuca na gemy)_'];
      for (const d of Object.values(DUNGEONS)) {
        const lvlReq = d.requiredCombatLevel ? ` lvl ${d.requiredCombatLevel}+` : '';
        const finalTier = dungeonRoomTier(d, d.rooms.length - 1);
        lines.push(
          `• \`${d.id}\` — **${d.name}** (${d.rooms.length} pokojów, T${d.baseTier}, finał T${finalTier}, party ${d.minPartySize}+${lvlReq}) — ${d.description}`,
        );
        lines.push(`  💎 Final boss: ${fmtGemDropChances(finalTier)}`);
      }
      lines.push('', 'Użycie: `.dungeon <id>` (lider party). Max party: ' + MAX_PARTY + '.');
      await msg.reply(lines.join('\n').slice(0, 1900));
      return;
    }

    const def = DUNGEONS[prompt];
    if (!def) {
      await msg.reply(`Nie ma dungeona \`${prompt}\`. Wpisz \`.dungeon\` żeby zobaczyć listę.`);
      return;
    }

    const check = this.canStart(player.id, def);
    if (!check.ok || !check.party) {
      await msg.reply(check.reason ?? 'Nie można rozpocząć.');
      return;
    }

    let thread: any;
    try {
      thread = await msg.startThread({
        name: `Dungeon: ${def.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });
      if (thread?.id) registerThread(thread);
    } catch (e) {
      await msg.reply(`Nie udało się otworzyć wątku: ${errMsg(e)}`);
      return;
    }

    await this.startBattleInThread(thread, check.party, def);
  }

  /**
   * Wspólny entry — wymaga pre-utworzonego wątku i party object zwalidowanego
   * przez `canStart`. Buduje combatants dla każdego party member, odpala
   * pierwszy boss z dungeon-tierem.
   */
  async startBattleInThread(thread: any, party: Party, def: DungeonDef): Promise<void> {
    const playerCombatants: BattleCombatant[] = party.members.map((memberId) => {
      const player = this.stats.get(memberId);
      const raw = buildPlayerCombatant(this.stats, player);
      return { ...raw, team: 0, controller: 'human' };
    });
    const firstBoss = buildDungeonBoss(def, 0, buildSuffix());
    const firstBossId = def.rooms[0];

    const state: DungeonBattleState = {
      _battleId: randomUUID(),
      id: thread.id,
      thread,
      combatants: [...playerCombatants, firstBoss],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      dungeonId: def.id,
      roomIndex: 0,
      currentBossId: firstBossId,
      partyMemberIds: [...party.members],
    };
    this.states.set(thread.id, state);

    // Dodaj wszystkich party members do wątku (jeśli to private — i tak nie zaszkodzi).
    if (thread.members && typeof thread.members.add === 'function') {
      for (const memberId of party.members) {
        await thread.members.add(memberId).catch(() => {});
      }
    }

    const memberMentions = party.members.map((id) => `<@${id}>`).join(' ');
    await thread.send(
      `🏰 **${def.name}** — wchodzi party!\n${memberMentions}\n_${def.description}_\n\nPokoje: ${def.rooms.length} · baseTier T${def.baseTier} · final boss T${dungeonRoomTier(def, def.rooms.length - 1)}.\nPierwszy: **${firstBoss.name}** (${firstBoss.hp} HP).`,
    );
    await this.promptHumans(state);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    await routeBattleInteraction<DungeonBattleState>(interaction, {
      getState: (id) => this.states.get(id),
      onChoiceRecorded: (state) => this.maybeResolve(state),
      notMineMessage: 'To nie twój dungeon.',
      alreadyDeadMessage: 'Już nie żyjesz w tym dungeonie.',
    });
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

      // Cała party padła lub remis — porażka.
      if (result.draw || result.winnerTeam === 1) {
        for (const memberId of state.partyMemberIds) {
          const member = this.stats.get(memberId);
          this.stats.setCooldown(member, 'dungeon', COOLDOWN_MS);
        }
        syncConsumablesAfterBattle(this.stats, state);
        this.stats.save();
        if (lines.length > 0) {
          await state.thread.send(lines.join('\n').slice(0, 1900));
        }
        await postBattleSummary(
          state.thread,
          `🏰 **${def.name}** — **porażka party**.\n💀 Wszyscy padają. Cooldown 30 min dla całej drużyny.`,
        );
        await closeBattleThread(
          state.thread,
          '🏁 Dungeon zakończony porażką — wątek archiwizujemy.',
        );
        this.states.delete(state.id);
        return;
      }

      // Pokój zaliczony — rewards z bossa idą do każdego żyjącego party-membera.
      const bossDef = BOSS_MOBS[state.currentBossId];
      const aliveHumans = state.combatants.filter((c) => c.team === 0 && c.hp > 0);
      lines.push(
        '',
        `✅ **Pokój ${state.roomIndex + 1}/${def.rooms.length} clear!** ${bossDef?.name ?? state.currentBossId} (T${dungeonRoomTier(def, state.roomIndex)}) pokonany.`,
      );
      if (bossDef?.rewards) {
        const scaledBossReward = scaleDungeonReward(bossDef.rewards);
        const roomTier = dungeonRoomTier(def, state.roomIndex);
        for (const human of aliveHumans) {
          const memberStats = this.stats.get(human.id, human.name);
          const award = awardReward(this.stats, memberStats, scaledBossReward, {
            socketable: true,
            tier: roomTier,
          });
          lines.push(`__${human.name}__:`);
          lines.push(...award.lines);
          const gemLines = awardGemDrops(this.stats, memberStats, roomTier);
          if (gemLines.length) lines.push(...gemLines);
        }
      }

      state.roomIndex += 1;
      if (state.roomIndex >= def.rooms.length) {
        const scaledFinal = scaleDungeonReward(def.finalReward);
        const finalTier = dungeonRoomTier(def, def.rooms.length - 1);
        for (const human of aliveHumans) {
          const memberStats = this.stats.get(human.id, human.name);
          const finalAward = awardReward(this.stats, memberStats, scaledFinal, {
            socketable: true,
            tier: finalTier,
          });
          lines.push('', `🏆 **${human.name}** — finalna nagroda:`);
          lines.push(...finalAward.lines);
          const gemLines = awardGemDrops(this.stats, memberStats, finalTier);
          if (gemLines.length) lines.push(...gemLines);
        }
        // Cooldown dla CAŁEJ party (nie tylko ocalałych) — żeby nie było farmu
        // przez ciągłe wskrzeszanie partnerów.
        for (const memberId of state.partyMemberIds) {
          const member = this.stats.get(memberId);
          this.stats.setCooldown(member, 'dungeon', COOLDOWN_MS);
        }
        syncConsumablesAfterBattle(this.stats, state);
        this.stats.save();
        if (lines.length > 0) {
          await state.thread.send(lines.join('\n').slice(0, 1900));
        }
        await postBattleSummary(
          state.thread,
          `🏆 **${def.name} ukończony!** Party pokonała wszystkie ${def.rooms.length} pokoi.`,
        );
        await closeBattleThread(state.thread, '🏁 Dungeon ukończony — wątek archiwizujemy.');
        this.states.delete(state.id);
        return;
      }

      const nextBoss = buildDungeonBoss(def, state.roomIndex, buildSuffix());
      // Resetujemy enemies — gracze zostają z aktualnym HP / buffami.
      state.combatants = state.combatants.filter((c) => c.team === 0);
      state.combatants.push(nextBoss);
      state.currentBossId = def.rooms[state.roomIndex];
      state.finished = false;
      state.winnerTeam = undefined;
      state.draw = undefined;
      this.stats.save();
      await state.thread.send(
        [
          ...lines,
          '',
          `🚪 **Pokój ${state.roomIndex + 1}/${def.rooms.length}** otwarty. Wchodzi **${nextBoss.name}** (${nextBoss.hp} HP, T${dungeonRoomTier(def, state.roomIndex)}).`,
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
