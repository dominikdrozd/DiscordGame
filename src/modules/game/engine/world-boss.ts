import {
  type ButtonInteraction,
  type Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { BOSS_MOBS, type Mob, type MobTier } from '../mobs/index.js';
import {
  type BattleCombatant,
  type BattleState,
  humansAlive,
} from './battle-state.js';
import { resolveBattleRound } from './combat-battle.js';
import { chooseAiAction } from './ai.js';
import { buildHumanCombatant } from './player-combatant.js';
import {
  hasSendable,
  hasThreadCreate,
  disableMessageComponents,
  sendMentionBatches,
} from './discord-helpers.js';
import { nextSlotAfter } from './scheduling.js';
import { awardReward } from '../services/reward.service.js';
import {
  syncConsumablesAfterBattle,
  closeBattleThread,
  promptHumansWithPanel,
  postBattleSummary,
  routeBattleInteraction,
} from './battle-helpers.js';
import { buildPanelOpenerRow } from '../ui/battle-buttons.js';
import { rollItemInstance } from '../services/items.js';
import { awardGemDrops } from '../services/gem-effects.js';
import { errMsg } from '../../../utils.js';

/** Co ile sprawdzamy czy nadeszła zaplanowana pora. */
const TICK_MS = 60_000;
/** Godziny w której world boss się pojawia (lokalna strefa). */
const SPAWN_HOURS: readonly number[] = [10, 13, 16, 19, 22];
/** Okno rejestracji do walki — od ogłoszenia do auto-startu. */
const REGISTRATION_WINDOW_MS = 5 * 60_000;
/** Minimalna liczba uczestników żeby walka się zaczęła. */
const MIN_PARTICIPANTS = 2;
/** Cap — Discord button row mieści się max ~25 mentions sensownie. */
const MAX_PARTICIPANTS = 8;
/** Bazowy mnożnik raid-tier — wyrównuje WB do solo/dungeon bossów (BOSS_MULT=3.5). */
const WORLD_BOSS_MULT = 3.5;
/** Bonusowe lege/epickie itemy losowane PER UCZESTNIK na końcu walki. */
const BONUS_DROP_POOL: readonly string[] = [
  'sword_diamond',
  'armor_diamond',
  'sword_runicum',
  'armor_runicum',
];

interface WorldBossEvent {
  channelId: string;
  /** id ogłoszeniowej wiadomości — używane do edytowania (zamykanie buttona). */
  announceMsgId?: string;
  participants: Set<string>;
  registrationEndsAt: number;
  /** Po `tryStart` przechodzimy do walki — state battle przejmuje. */
  battleId?: string;
}

interface WorldBossBattleState extends BattleState {
  participantIds: string[];
  bossId: string;
}


function buildAnnounceRow(channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wbjoin:${channelId}`)
      .setLabel('⚔️ Dołącz do walki')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Mapowanie average combat lvl → tier bossa.
 * 1-7 → T1, 8-15 → T2, 16-23 → T3, 24-31 → T4, 32+ → T5.
 */
function tierForAvgLvl(avgLvl: number): MobTier {
  if (avgLvl < 8) return 1;
  if (avgLvl < 16) return 2;
  if (avgLvl < 24) return 3;
  if (avgLvl < 32) return 4;
  return 5;
}

function pickRandomBoss(): Mob {
  const ids = Object.keys(BOSS_MOBS);
  const id = ids[Math.floor(Math.random() * ids.length)];
  return BOSS_MOBS[id];
}

/**
 * World Boss event: co rowną godzinę ogłoszenie z buttonem "Dołącz", okno
 * rejestracji 5 min, jeśli ≥ MIN_PARTICIPANTS — start walki w nowym wątku
 * z random bossem o tierze dopasowanym do avg combat lvl. Każdy uczestnik
 * dostaje base reward bossa + losowy bonus item z BONUS_DROP_POOL.
 *
 * In-memory state: pojedynczy `pendingEvent` (ogłoszenie + participants),
 * po starcie walki przechodzi do `battles` Map jak ambush.
 *
 * Konfiguracja: env `WORLD_BOSS_CHANNEL_ID` — single channel id dla
 * ogłoszeń (MVP). Brak → loop tick'uje ale nic nie ogłasza.
 */
export class WorldBossService {
  private timer: NodeJS.Timeout | null = null;
  private pendingEvent: WorldBossEvent | null = null;
  private readonly battles = new Map<string, WorldBossBattleState>();
  private nextSpawnAt: number = 0;

  constructor(
    private readonly client: Client,
    private readonly stats: PlayerStatsService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextSpawnAt = nextSlotAfter(Date.now(), SPAWN_HOURS);
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.error('[world-boss] tick fail:', errMsg(e)));
    }, TICK_MS);
    this.timer.unref?.();
    console.log(
      `[world-boss] loop started, next spawn at ${new Date(this.nextSpawnAt).toISOString()}`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public: dla testów + ręcznego trigger via slash command (admin). */
  async forceSpawn(): Promise<void> {
    await this.spawnAnnouncement();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    // Zamknij rejestrację jeśli czas minął.
    if (this.pendingEvent && now >= this.pendingEvent.registrationEndsAt) {
      const evt = this.pendingEvent;
      this.pendingEvent = null;
      await this.tryStartFight(evt);
    }
    if (now >= this.nextSpawnAt) {
      this.nextSpawnAt = nextSlotAfter(now, SPAWN_HOURS);
      await this.spawnAnnouncement();
    }
  }

  private async spawnAnnouncement(): Promise<void> {
    const channelId = process.env.WORLD_BOSS_CHANNEL_ID;
    if (!channelId) {
      console.warn(
        '[world-boss] WORLD_BOSS_CHANNEL_ID nie ustawione — pomijam announcement. Ustaw w .env żeby ogłaszać world bossy.',
      );
      return;
    }
    if (this.pendingEvent) return;
    if (this.battles.size > 0) return;

    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) {
      console.error(`[world-boss] channel ${channelId} unreachable`);
      return;
    }

    const mentions = this.stats.list().map((p) => `<@${p.id}>`);
    const MENTION_BATCH = 50;

    const registrationEndsAt = Date.now() + REGISTRATION_WINDOW_MS;
    const sent = await channel
      .send({
        content: [
          '🌋 **POJAWIA SIĘ WORLD BOSS!**',
          mentions.slice(0, MENTION_BATCH).join(' '),
          `Zbierzcie się w ciągu **${Math.round(REGISTRATION_WINDOW_MS / 60_000)} min** —`,
          `kliknij guzik poniżej, żeby dołączyć. Min ${MIN_PARTICIPANTS}, max ${MAX_PARTICIPANTS} graczy.`,
          'Tier bossa zostanie dopasowany do avg combat lvl uczestników.',
          'Drop: bazowe rewardy bossa + bonusowy lege/epicki item per gracz.',
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1900),
        components: [buildAnnounceRow(channelId)],
      })
      .catch(() => null);
    await sendMentionBatches(channel, mentions, MENTION_BATCH, MENTION_BATCH);

    const announceMsgId =
      sent && typeof sent === 'object' && 'id' in sent && typeof sent.id === 'string'
        ? sent.id
        : undefined;

    this.pendingEvent = {
      channelId,
      announceMsgId,
      participants: new Set(),
      registrationEndsAt,
    };
  }

  /** Public: tryStartFight może być wywołany ręcznie (po MAX uczestnikach). */
  async tryStartFight(evt: WorldBossEvent): Promise<void> {
    const channel = await this.client.channels.fetch(evt.channelId).catch(() => null);
    if (!channel || !hasSendable(channel)) return;

    if (evt.participants.size < MIN_PARTICIPANTS) {
      await channel
        .send(
          `🌫️ World boss się ulotnił — za mało chętnych (zgłosiło się ${evt.participants.size}, potrzeba ${MIN_PARTICIPANTS}+).`,
        )
        .catch(() => {});
      await this.disableAnnounceButton(evt);
      return;
    }

    const participants = [...evt.participants];
    const players = participants.map((id) => this.stats.get(id));
    const avgLvl =
      players.reduce((sum, p) => sum + p.skills.combat.level, 0) / players.length;
    const tier = tierForAvgLvl(avgLvl);
    const boss = pickRandomBoss();
    // Atomic: setTier + toCombatant w jednym synchronicznym kroku, przed
    // jakimkolwiek await — zapobiega race condition gdyby drugi event
    // wystartował na tym samym shared `BOSS_MOBS[id]` instance.
    boss.setTier(tier);
    const baseRaw = boss.toCombatant(`wb_${Date.now().toString(36)}`);
    const bossHp = Math.round(baseRaw.hp * WORLD_BOSS_MULT * participants.length);
    const bossDmg = Math.round(baseRaw.damageBonus * WORLD_BOSS_MULT);
    const bossDef =
      baseRaw.defenseBonus !== undefined
        ? Math.round(baseRaw.defenseBonus * WORLD_BOSS_MULT)
        : undefined;
    const bossCombatantRaw = {
      ...baseRaw,
      hp: bossHp,
      maxHp: bossHp,
      damageBonus: bossDmg,
      defenseBonus: bossDef,
    };
    const bossName = boss.name;

    if (!hasThreadCreate(channel)) {
      await channel
        .send('Nie mogę otworzyć wątku na world boss — kanał nie wspiera wątków.')
        .catch(() => {});
      return;
    }
    const thread = await channel.threads
      .create({
        name: `🌋 World Boss: ${bossName}`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch(() => null);

    if (!thread || typeof thread !== 'object' || !('id' in thread) || typeof thread.id !== 'string') {
      await channel.send('Nie udało się otworzyć wątku world boss.').catch(() => {});
      return;
    }
    const tid = (thread as { id: string }).id;

    const playerCombatants: BattleCombatant[] = players.map((p) =>
      buildHumanCombatant(this.stats, p, 0),
    );
    const bossCombatant: BattleCombatant = {
      ...bossCombatantRaw,
      team: 1,
      controller: 'ai',
    };

    const state: WorldBossBattleState = {
      id: tid,
      thread,
      combatants: [...playerCombatants, bossCombatant],
      pending: new Map(),
      promptMessageIds: new Map(),
      roundNumber: 1,
      finished: false,
      participantIds: participants,
      bossId: boss.id,
    };
    this.battles.set(tid, state);

    await this.disableAnnounceButton(evt);

    const tt = thread as { send?: (payload: unknown) => Promise<unknown> };
    if (tt.send) {
      await tt
        .send({
          content: [
            `🌋 **${boss.name}** (T${tier}) wkracza do walki przeciw ${players.length} graczom!`,
            `${participants.map((id) => `<@${id}>`).join(' ')}`,
            `_raid-tier ×${WORLD_BOSS_MULT}, HP skalowane ×${players.length} uczestników._`,
            `HP bossa: **${bossCombatant.hp}**, dmg bonus: **+${bossCombatant.damageBonus}**.`,
            'Wybierajcie akcje — runda rozliczy się gdy wszyscy podają.',
          ].join('\n'),
        })
        .catch(() => {});
    }
    await this.promptHumans(state);
  }

  private async disableAnnounceButton(evt: WorldBossEvent): Promise<void> {
    if (!evt.announceMsgId) return;
    await disableMessageComponents(this.client, evt.channelId, evt.announceMsgId);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (interaction.customId.startsWith('wbjoin:')) {
      await this.handleJoin(interaction);
      return;
    }
    await routeBattleInteraction<WorldBossBattleState>(interaction, {
      getState: (id) => this.battles.get(id),
      onChoiceRecorded: (state) => this.maybeResolve(state),
      notMineMessage: 'To nie twój world boss.',
      alreadyDeadMessage: 'Już padłeś w tej walce.',
    });
  }

  private async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const evt = this.pendingEvent;
    if (!evt) {
      await interaction
        .reply({
          content: 'Rejestracja zamknięta — następny world boss za niedługo.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    const userId = interaction.user.id;
    if (evt.participants.has(userId)) {
      await interaction
        .reply({ content: '✅ Już jesteś zapisany.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      await interaction
        .reply({ content: `Slot pełny (max ${MAX_PARTICIPANTS}).`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    // Upewnij się, że gracz ma profil.
    this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    evt.participants.add(userId);
    await interaction
      .reply({
        content: `⚔️ Dołączasz! Aktualnie zapisanych: ${evt.participants.size}/${MAX_PARTICIPANTS}.`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});

    // Auto-start gdy slot pełny.
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      this.pendingEvent = null;
      await this.tryStartFight(evt);
    }
  }

  private async maybeResolve(state: WorldBossBattleState): Promise<void> {
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
      const boss = BOSS_MOBS[state.bossId];

      if (result.draw || result.winnerTeam === 1) {
        syncConsumablesAfterBattle(this.stats, state);
        this.stats.save();
        if (lines.length > 0) {
          await state.thread.send(lines.join('\n').slice(0, 1900));
        }
        await postBattleSummary(
          state.thread,
          `💀 **World Boss zwycięża!** Brak nagród. Następny boss za godzinę.`,
        );
        await closeBattleThread(state.thread, '🏁 Walka przegrana — wątek archiwizujemy.');
        this.battles.delete(state.id);
        return;
      }

      // Wygrana — distribute rewards.
      const aliveHumans = state.combatants.filter((c) => c.team === 0 && c.hp > 0);
      lines.push('', `🏆 **${boss?.name ?? state.bossId} pokonany!** Łupy:`);
      for (const human of aliveHumans) {
        const memberStats = this.stats.get(human.id, human.name);
        if (boss?.rewards) {
          const award = awardReward(this.stats, memberStats, boss.rewards, {
            socketable: true,
            worldBoss: true,
          });
          lines.push(`__${human.name}__:`);
          lines.push(...award.lines);
        }
        // Bonus lege/epicki item — world boss ma najwyższą szansę na legendary.
        const bonusId = BONUS_DROP_POOL[Math.floor(Math.random() * BONUS_DROP_POOL.length)];
        const bonus = rollItemInstance(bonusId, { socketable: true, worldBoss: true });
        if (bonus) {
          this.stats.addItem(memberStats, bonus);
          lines.push(`🎁 **Bonus world-boss:** ${bonus.name} \`${bonus.uid}\``);
        }
        const gemLines = awardGemDrops(this.stats, memberStats, boss?.tier ?? 5);
        for (const line of gemLines) lines.push(line);
      }
      syncConsumablesAfterBattle(this.stats, state);
      this.stats.save();
      if (lines.length > 0) {
        await state.thread.send(lines.join('\n').slice(0, 1900));
      }
      await postBattleSummary(
        state.thread,
        `🏆 **World Boss ${boss?.name ?? state.bossId} pokonany!** Drużyna ${aliveHumans.length} graczy zdobywa łupy.`,
      );
      await closeBattleThread(state.thread, '🏁 Walka zakończona — wątek archiwizujemy.');
      this.battles.delete(state.id);
      return;
    }

    await state.thread.send(
      [...lines, '', this.fmtBoard(state), `⏭ Runda ${state.roundNumber}`].join('\n'),
    );
    await this.promptHumans(state);
  }

  private async promptHumans(state: WorldBossBattleState): Promise<void> {
    await promptHumansWithPanel(state);
  }

  private fmtBoard(state: WorldBossBattleState): string {
    return state.combatants
      .map(
        (c) =>
          `${c.name}: ${c.hp}/${c.maxHp} HP${c.controller === 'human' ? ` (potki: ${c.consumables?.potion_small ?? 0})` : ''}`,
      )
      .join(' | ');
  }
}
