import {
  type ButtonInteraction,
  type Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { BOSS_MOBS, type Mob, type MobTier } from '../mobs/index.js';
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
import { awardReward } from '../services/reward.service.js';
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
} from './battle-helpers.js';
import { buildPanelOpenerRow, buildTargetRow } from '../ui/battle-buttons.js';
import { rollItemInstance } from '../services/items.js';
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

function hasSendable(c: unknown): c is { send: (payload: unknown) => Promise<unknown> } {
  if (!c || typeof c !== 'object') return false;
  if (!('send' in c)) return false;
  return typeof (c as { send: unknown }).send === 'function';
}

/**
 * Zwraca timestamp najbliższego slotu z `SPAWN_HOURS` po `now` (lokalny TZ).
 * Jeśli wszystkie sloty na dziś już przeszły — przewija na pierwszy slot
 * jutra.
 */
function nextSpawnSlot(now: number): number {
  const d = new Date(now);
  for (const h of SPAWN_HOURS) {
    const candidate = new Date(d);
    candidate.setHours(h, 0, 0, 0);
    if (candidate.getTime() > now) return candidate.getTime();
  }
  // Wszystkie dzisiejsze sloty minęły → pierwszy jutrzejszy.
  const tomorrow = new Date(d);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(SPAWN_HOURS[0], 0, 0, 0);
  return tomorrow.getTime();
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
    this.nextSpawnAt = nextSpawnSlot(Date.now());
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
      this.nextSpawnAt = nextSpawnSlot(now);
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

    const allPlayers = this.stats.list();
    const mentions = allPlayers.map((p) => `<@${p.id}>`);
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
    for (let i = MENTION_BATCH; i < mentions.length; i += MENTION_BATCH) {
      await channel
        .send({ content: mentions.slice(i, i + MENTION_BATCH).join(' ').slice(0, 1900) })
        .catch(() => {});
    }

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
    boss.setTier(tier);

    // Otwórz publiczny wątek na walkę.
    if (!('threads' in channel) || typeof (channel as { threads?: unknown }).threads !== 'object') {
      await channel.send('Nie mogę otworzyć wątku na world boss — kanał nie wspiera wątków.').catch(() => {});
      return;
    }
    const threadsApi = (channel as { threads: { create?: (opts: unknown) => Promise<unknown> } })
      .threads;
    if (!threadsApi.create) {
      await channel.send('Nie mogę otworzyć wątku — brak API.').catch(() => {});
      return;
    }
    const thread = await threadsApi
      .create({
        name: `🌋 World Boss: ${boss.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      })
      .catch(() => null);

    if (!thread || typeof thread !== 'object' || !('id' in thread) || typeof thread.id !== 'string') {
      await channel.send('Nie udało się otworzyć wątku world boss.').catch(() => {});
      return;
    }
    const tid = (thread as { id: string }).id;

    // Build combatants.
    const playerCombatants: BattleCombatant[] = players.map((p) => ({
      ...buildPlayerCombatant(this.stats, p),
      team: 0,
      controller: 'human',
    }));
    const bossCombatant: BattleCombatant = {
      ...boss.toCombatant(`wb_${Date.now().toString(36)}`),
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
    const channel = await this.client.channels.fetch(evt.channelId).catch(() => null);
    if (!channel || !('messages' in channel)) return;
    const msgs = (channel as { messages?: { fetch?: (id: string) => Promise<unknown> } }).messages;
    if (!msgs?.fetch) return;
    const msg = await msgs.fetch(evt.announceMsgId).catch(() => null);
    if (!msg || typeof msg !== 'object' || !('edit' in msg)) return;
    const edit = (msg as { edit?: (payload: unknown) => Promise<unknown> }).edit;
    if (!edit) return;
    await edit.call(msg, { components: [] }).catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    const id = interaction.customId;

    // Rejestracja na world boss event.
    if (id.startsWith('wbjoin:')) {
      await this.handleJoin(interaction);
      return;
    }

    // Combat interactions — battleId w parts[1].
    const battleId = id.split(':')[1];
    if (!this.battles.has(battleId)) return;
    if (id.startsWith('pnl:')) return this.handlePanel(interaction);
    if (id.startsWith('bat:')) return this.handleAction(interaction);
    if (id.startsWith('tgt:')) return this.handleTarget(interaction);
    if (id.startsWith('itmpick:')) return this.handleItemPick(interaction);
    if (id.startsWith('sklpick:')) return this.handleSklPick(interaction);
    if (id.startsWith('skltgt:')) return this.handleSklTarget(interaction);
  }

  private async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const evt = this.pendingEvent;
    if (!evt) {
      await interaction
        .reply({
          content: 'Rejestracja zamknięta — następny world boss za niedługo.',
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    const userId = interaction.user.id;
    if (evt.participants.has(userId)) {
      await interaction
        .reply({ content: '✅ Już jesteś zapisany.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      await interaction
        .reply({ content: `Slot pełny (max ${MAX_PARTICIPANTS}).`, ephemeral: true })
        .catch(() => {});
      return;
    }
    // Upewnij się, że gracz ma profil.
    this.stats.get(userId, interaction.user.globalName ?? interaction.user.username);
    evt.participants.add(userId);
    await interaction
      .reply({
        content: `⚔️ Dołączasz! Aktualnie zapisanych: ${evt.participants.size}/${MAX_PARTICIPANTS}.`,
        ephemeral: true,
      })
      .catch(() => {});

    // Auto-start gdy slot pełny.
    if (evt.participants.size >= MAX_PARTICIPANTS) {
      this.pendingEvent = null;
      await this.tryStartFight(evt);
    }
  }

  private async handlePanel(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.battles.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    await handlePanelOpen(interaction, state);
  }

  private async handleItemPick(interaction: ButtonInteraction): Promise<void> {
    const [, battleId] = interaction.customId.split(':');
    const state = this.battles.get(battleId);
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
    const state = this.battles.get(battleId);
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
    const state = this.battles.get(battleId);
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
    const state = this.battles.get(battleId);
    if (!state) return;
    if (state.finished) {
      await ackStaleInteraction(interaction);
      return;
    }
    if (interaction.user.id !== combatantId) {
      await interaction
        .reply({ content: 'To nie twój world boss.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const me = findCombatant(state, combatantId);
    if (!me || me.hp <= 0) {
      await interaction
        .reply({ content: 'Już padłeś w tej walce.', ephemeral: true })
        .catch(() => {});
      return;
    }
    if (state.pending.has(combatantId)) {
      await interaction.reply({ content: 'Już wybrałeś.', ephemeral: true }).catch(() => {});
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
    const state = this.battles.get(battleId);
    if (!state) return;
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
      const me = findCombatant(state, combatantId);
      if (!target || target.hp <= 0) {
        if (!me) {
          await interaction.update({ content: 'Cel padł.', components: [] }).catch(() => {});
          return;
        }
        const enemies = aliveEnemies(state, me);
        if (enemies.length === 0) {
          state.pending.set(combatantId, { kind: 'defend' });
          await interaction
            .update({ content: 'Boss padł — idziesz w obronę.', components: [] })
            .catch(() => {});
          await notifyChoiceMade(state, combatantId);
        } else {
          state.pending.set(combatantId, { kind: 'attack', targetId: enemies[0].id });
          await interaction
            .update({
              content: `Atakujesz **${enemies[0].name}**.`,
              components: [],
            })
            .catch(() => {});
          await notifyChoiceMade(state, combatantId);
        }
      } else {
        state.pending.set(combatantId, { kind: 'attack', targetId });
        await interaction
          .update({ content: `Wybrany: **${target.name}**.`, components: [] })
          .catch(() => {});
        await notifyChoiceMade(state, combatantId);
      }
    } else {
      await interaction
        .update({ content: `Nieznany kind \`${kind}\`.`, components: [] })
        .catch(() => {});
      return;
    }
    await this.maybeResolve(state);
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
          const award = awardReward(this.stats, memberStats, boss.rewards);
          lines.push(`__${human.name}__:`);
          lines.push(...award.lines);
        }
        // Bonus lege/epicki item — niezależny roll per gracz.
        const bonusId = BONUS_DROP_POOL[Math.floor(Math.random() * BONUS_DROP_POOL.length)];
        const bonus = rollItemInstance(bonusId);
        if (bonus) {
          this.stats.addItem(memberStats, bonus);
          lines.push(`🎁 **Bonus world-boss:** ${bonus.name} \`${bonus.uid}\``);
        }
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
