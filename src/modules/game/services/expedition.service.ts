import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService } from './player-stats.js';
import { PartyService } from './party.js';
import {
  EXPEDITIONS,
  REGION_LVL_REQ,
  expeditionLvlBracket,
  expeditionMinLvl,
} from '../engine/encounters.js';
import { rollLootMany } from './loot.js';
import { rollItemInstance, fmtInstance, ITEMS } from './items.js';
import { displayName } from '../../../utils.js';

export class ExpeditionService {
  constructor(
    private readonly stats: PlayerStatsService,
    private readonly party: PartyService,
  ) {}

  async handle(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);
    const sub = args[0] ?? '';

    if (!sub) return this.list(msg);
    if (sub === 'status') return this.status(msg);
    if (sub === 'claim') return this.claim(msg);
    if (sub === 'start') return this.start(msg, args[1]);
    await msg.reply(
      'Użycie: `.expedition` / `.expedition start <id>` / `.expedition status` / `.expedition claim`.',
    );
  }

  private async list(msg: any): Promise<void> {
    const sorted = Object.values(EXPEDITIONS).sort((a, b) => {
      if (a.region !== b.region) return a.region - b.region;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.name.localeCompare(b.name);
    });
    const lines: string[] = ['🗺️ **Wyprawy:**'];
    let currentRegion = 0;
    for (const e of sorted) {
      if (e.region !== currentRegion) {
        currentRegion = e.region;
        const regionMin = REGION_LVL_REQ[e.region];
        lines.push(
          '',
          `**Region ${e.region} — ${e.regionName}** _(wymaga combat lvl ${regionMin}+)_`,
        );
      }
      const lvlReq = expeditionLvlBracket(e.tier);
      lines.push(
        `• \`${e.id}\` (T${e.tier}, lvl ${lvlReq}) — **${e.name}** (${Math.round(e.durationMs / 60_000)} min) — ${e.description}`,
      );
    }
    lines.push(
      '',
      'Użycie: `.expedition start <id>` / `.expedition status` / `.expedition claim`.',
    );
    await msg.reply(lines.join('\n').slice(0, 1900));
  }

  private async status(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    if (!player.activeExpedition) {
      await msg.reply('Nie masz aktywnej wyprawy.');
      return;
    }
    const def = EXPEDITIONS[player.activeExpedition.destination];
    const left = player.activeExpedition.endsAt - Date.now();
    if (left <= 0) {
      await msg.reply(
        `✅ **${def?.name ?? player.activeExpedition.destination}** zakończona — odbierz \`.expedition claim\`.`,
      );
      return;
    }
    await msg.reply(
      `🗺️ **${def?.name ?? player.activeExpedition.destination}** trwa — koniec za ${Math.ceil(left / 60_000)} min.`,
    );
  }

  private async claim(msg: any): Promise<void> {
    const player = this.stats.get(msg.author.id, displayName(msg));
    if (!player.activeExpedition) {
      await msg.reply('Nie masz wyprawy do odebrania.');
      return;
    }
    if (player.activeExpedition.endsAt > Date.now()) {
      const left = player.activeExpedition.endsAt - Date.now();
      await msg.reply(`Wyprawa jeszcze trwa, zostało ${Math.ceil(left / 60_000)} min.`);
      return;
    }
    const def = EXPEDITIONS[player.activeExpedition.destination];
    player.activeExpedition = null;
    if (!def) {
      this.stats.save();
      await msg.reply('Wyprawa zniknęła z konfiguracji — wyczyszczone.');
      return;
    }
    const drops = rollLootMany(def.lootTable, player.skills.combat.level, def.rolls);
    const labels: string[] = [];
    for (const d of drops) {
      this.stats.addResource(player, d.itemId, d.qty);
      labels.push(`${ITEMS[d.itemId]?.name ?? d.itemId} ×${d.qty}`);
    }
    const xpLeveled = this.stats.addXp(player, def.xp);
    const combatLeveled = def.combatXp
      ? this.stats.addSkillXp(player, 'combat', def.combatXp)
      : false;
    let dropLine = '';
    if (def.dropPool && def.dropPool.length && Math.random() < (def.guaranteedDropChance ?? 0)) {
      const baseId = def.dropPool[Math.floor(Math.random() * def.dropPool.length)];
      const item = rollItemInstance(baseId);
      if (item) {
        this.stats.addItem(player, item);
        dropLine = `\nZnaleziono: ${fmtInstance(item)} \`${item.uid}\``;
      }
    }
    this.stats.save();
    await msg.reply(
      [
        `🏁 **${def.name}** zakończona!`,
        `Loot: ${labels.length ? labels.join(', ') : '(nic)'}`,
        `+${def.xp} XP PvP${xpLeveled ? ' 🎉 LEVEL UP!' : ''}` +
          (def.combatXp
            ? `, +${def.combatXp} XP combat${combatLeveled ? ' 🎉 LEVEL UP!' : ''}`
            : ''),
        dropLine,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private async start(msg: any, destId: string | undefined): Promise<void> {
    if (!destId) {
      await msg.reply('Użycie: `.expedition start <id>`.');
      return;
    }
    const def = EXPEDITIONS[destId];
    if (!def) {
      await msg.reply(`Nie ma wyprawy \`${destId}\`. Zobacz \`.expedition\`.`);
      return;
    }
    const partyEntity = this.party.getByMember(msg.author.id);
    const isLeader = partyEntity?.leaderId === msg.author.id;
    if (partyEntity && !isLeader) {
      await msg.reply('Wyprawę dla party może rozpocząć tylko lider.');
      return;
    }
    const targets = partyEntity ? partyEntity.members : [msg.author.id];
    const leaderStats = this.stats.get(msg.author.id, displayName(msg));
    const regionMin = REGION_LVL_REQ[def.region];
    if (leaderStats.skills.combat.level < regionMin) {
      await msg.reply(
        `🚫 **Region ${def.region} (${def.regionName})** wymaga combat lvl **${regionMin}**. Masz ${leaderStats.skills.combat.level}.`,
      );
      return;
    }
    const minLvl = expeditionMinLvl(def.tier);
    if (leaderStats.skills.combat.level < minLvl) {
      await msg.reply(
        `🚫 **${def.name}** wymaga combat lvl **${minLvl}** (T${def.tier}). Masz ${leaderStats.skills.combat.level}.`,
      );
      return;
    }

    for (const id of targets) {
      const member = this.stats.get(id, id === msg.author.id ? displayName(msg) : id);
      if (member.activeExpedition) {
        const left = member.activeExpedition.endsAt - Date.now();
        if (left > 0) {
          await msg.reply(
            `<@${id}> ma wyprawę w toku (zostało ${Math.ceil(left / 60_000)} min) — nie mogę startować.`,
          );
          return;
        }
        await msg.reply(
          `<@${id}> ma niezebrane nagrody z poprzedniej wyprawy — niech użyje \`.expedition claim\`.`,
        );
        return;
      }
    }

    const endsAt = Date.now() + def.durationMs;
    for (const id of targets) {
      const member = this.stats.get(id, id === msg.author.id ? displayName(msg) : id);
      member.activeExpedition = {
        destination: destId,
        endsAt,
        channelId: msg.channel?.id,
        partyId: partyEntity?.id,
      };
    }
    this.stats.save();

    const tag = partyEntity ? `dla party (${targets.map((id) => `<@${id}>`).join(', ')})` : '';
    await msg.reply(
      `🗺️ **${def.name}** rozpoczęta ${tag} — wraca za ${Math.round(def.durationMs / 60_000)} min. \`.expedition status\` żeby sprawdzić.`,
    );
  }
}
