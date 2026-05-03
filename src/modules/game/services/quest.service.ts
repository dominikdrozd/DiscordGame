import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { QUESTS, getQuest, listQuests, type QuestDef } from '../quests/index.js';
import { ITEMS, rollItemInstance, fmtInstance } from './items.js';

/**
 * Quest tracking + business logic. Stateless poza referencją do
 * `PlayerStatsService` — wszystko trzymane w `PlayerStats.quests`.
 *
 * Mechaniki:
 *  - `take(player, questId)` — start questa (raz w życiu, blokuje retake).
 *  - `abandon(player, questId)` — przenosi do abandoned (też blokuje retake).
 *  - `canTurnIn(player, questId)` — sprawdza czy quest active + ma item.
 *  - `turnIn(player, questId)` — kompletuje questa, daje nagrody, zużywa item.
 *  - `onExpeditionClaim(player)` — hook przy każdym claim, roluje quest dropy.
 *  - `onBossKilled(player, bossId)` — hook po zwycięstwie nad bossem (na razie
 *    nieużywane — żaden quest nie ma `killBoss`, ale infra zostaje na przyszłość).
 */
export class QuestService {
  constructor(private readonly stats: PlayerStatsService) {}

  // ── Status helpers ─────────────────────────────────

  isStarted(p: PlayerStats, questId: string): boolean {
    return (
      p.quests.active.includes(questId) ||
      p.quests.completed.includes(questId) ||
      p.quests.abandoned.includes(questId)
    );
  }

  isActive(p: PlayerStats, questId: string): boolean {
    return p.quests.active.includes(questId);
  }

  isCompleted(p: PlayerStats, questId: string): boolean {
    return p.quests.completed.includes(questId);
  }

  isAbandoned(p: PlayerStats, questId: string): boolean {
    return p.quests.abandoned.includes(questId);
  }

  // ── Listing ────────────────────────────────────────

  /** Wszystkie questy które gracz może wziąć (nie started + spełnia requirements). */
  available(p: PlayerStats): QuestDef[] {
    return listQuests().filter((q) => this.canTake(p, q).ok);
  }

  active(p: PlayerStats): QuestDef[] {
    return p.quests.active.map((id) => QUESTS[id]).filter((q): q is QuestDef => !!q);
  }

  completed(p: PlayerStats): QuestDef[] {
    return p.quests.completed.map((id) => QUESTS[id]).filter((q): q is QuestDef => !!q);
  }

  // ── Actions ────────────────────────────────────────

  canTake(p: PlayerStats, quest: QuestDef): { ok: boolean; reason?: string } {
    if (this.isStarted(p, quest.id)) {
      return { ok: false, reason: 'Już brałeś tego questa.' };
    }
    if (quest.requiredCombatLevel && p.skills.combat.level < quest.requiredCombatLevel) {
      return {
        ok: false,
        reason: `Wymagany combat lvl ${quest.requiredCombatLevel} (masz ${p.skills.combat.level}).`,
      };
    }
    if (quest.prerequisiteQuestIds) {
      for (const prereq of quest.prerequisiteQuestIds) {
        if (!this.isCompleted(p, prereq)) {
          const name = QUESTS[prereq]?.name ?? prereq;
          return { ok: false, reason: `Wymaga ukończonego questa: **${name}**.` };
        }
      }
    }
    return { ok: true };
  }

  /** Próba wzięcia questa. Zwraca line do logu. */
  take(p: PlayerStats, questId: string): { ok: boolean; line: string } {
    const quest = getQuest(questId);
    if (!quest) return { ok: false, line: `Nie ma questa \`${questId}\`.` };
    const check = this.canTake(p, quest);
    if (!check.ok) return { ok: false, line: `🚫 ${check.reason}` };
    p.quests.active.push(quest.id);
    return { ok: true, line: `📜 Wziąłeś questa: **${quest.name}**.` };
  }

  /** Porzucenie questa — przenosi do abandoned (nie da się więcej wziąć). */
  abandon(p: PlayerStats, questId: string): { ok: boolean; line: string } {
    if (!this.isActive(p, questId)) {
      return { ok: false, line: `Nie masz aktywnego questa \`${questId}\`.` };
    }
    p.quests.active = p.quests.active.filter((id) => id !== questId);
    p.quests.abandoned.push(questId);
    const quest = getQuest(questId);
    return { ok: true, line: `🗑️ Porzuciłeś questa: **${quest?.name ?? questId}**.` };
  }

  /** Czy gracz spełnia warunki turn-inu (item w plecaku itd.). */
  canTurnIn(p: PlayerStats, questId: string): boolean {
    if (!this.isActive(p, questId)) return false;
    const quest = getQuest(questId);
    if (!quest) return false;
    if (quest.turnInItem) {
      const have = p.inventory.resources[quest.turnInItem.itemId] ?? 0;
      if (have < quest.turnInItem.qty) return false;
    }
    return true;
  }

  /**
   * Turn-in u NPC — sprawdza warunki, zużywa item, daje nagrodę,
   * przenosi do completed.
   */
  turnIn(p: PlayerStats, questId: string): { ok: boolean; line: string } {
    const quest = getQuest(questId);
    if (!quest) return { ok: false, line: `Nie ma questa \`${questId}\`.` };
    if (!this.isActive(p, questId)) {
      return { ok: false, line: `Nie masz aktywnego questa **${quest.name}**.` };
    }
    if (quest.turnInItem) {
      const have = p.inventory.resources[quest.turnInItem.itemId] ?? 0;
      if (have < quest.turnInItem.qty) {
        const itemName = ITEMS[quest.turnInItem.itemId]?.name ?? quest.turnInItem.itemId;
        return {
          ok: false,
          line: `🚫 Brak: **${itemName} ×${quest.turnInItem.qty}** (masz ${have}).`,
        };
      }
      this.stats.removeResource(p, quest.turnInItem.itemId, quest.turnInItem.qty);
    }
    // Apply rewards
    const lines: string[] = [`✅ Quest **${quest.name}** ukończony!`];
    if (quest.reward.gold) {
      this.stats.addGold(p, quest.reward.gold);
      lines.push(`💰 +${quest.reward.gold}g`);
    }
    if (quest.reward.xp) {
      const lvl = this.stats.addXp(p, quest.reward.xp);
      lines.push(`✨ +${quest.reward.xp} XP PvP${lvl ? ' 🎉 LEVEL UP!' : ''}`);
    }
    if (quest.reward.combatXp) {
      const lvl = this.stats.addSkillXp(p, 'combat', quest.reward.combatXp);
      lines.push(`⚔️ +${quest.reward.combatXp} XP combat${lvl ? ' 🎉 LEVEL UP!' : ''}`);
    }
    if (quest.reward.rewardItemId) {
      const item = rollItemInstance(quest.reward.rewardItemId);
      if (item) {
        this.stats.addItem(p, item);
        lines.push(`🎁 Drop: ${fmtInstance(item)} \`${item.uid}\``);
      }
    }
    // Move to completed
    p.quests.active = p.quests.active.filter((id) => id !== questId);
    p.quests.completed.push(questId);
    return { ok: true, line: lines.join('\n') };
  }

  // ── Hooks ──────────────────────────────────────────

  /**
   * Hook wywoływany po `expedition.runClaim`. Roluje quest dropy dla
   * wszystkich aktywnych questów z `expeditionDrop`. Zwraca lines do
   * doklejenia do summary wyprawy.
   */
  onExpeditionClaim(p: PlayerStats): string[] {
    const lines: string[] = [];
    for (const questId of p.quests.active) {
      const quest = QUESTS[questId];
      if (!quest?.expeditionDrop) continue;
      if (Math.random() < quest.expeditionDrop.chance) {
        this.stats.addResource(p, quest.expeditionDrop.itemId, 1);
        const itemName = ITEMS[quest.expeditionDrop.itemId]?.name ?? quest.expeditionDrop.itemId;
        lines.push(`📜 Quest **${quest.name}**: znalazłeś **${itemName}**!`);
      }
    }
    return lines;
  }

  /**
   * Hook po zwycięstwie nad bossem. Auto-completuje questy z `killBoss === bossId`.
   * Reward przyznawany od razu (bez turn-inu).
   */
  onBossKilled(p: PlayerStats, bossId: string): string[] {
    const lines: string[] = [];
    for (const questId of [...p.quests.active]) {
      const quest = QUESTS[questId];
      if (!quest || quest.killBoss !== bossId) continue;
      const result = this.turnIn(p, questId);
      if (result.ok) lines.push(result.line);
    }
    return lines;
  }
}
