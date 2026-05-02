import { PlayerStatsService } from './player-stats.js';
import { rollLootMany } from './loot.js';
import { rollItemInstance, fmtInstance } from './items.js';
import type { BossReward } from '../engine/encounters.js';

export function awardReward(
  stats: PlayerStatsService,
  player: ReturnType<PlayerStatsService['get']>,
  reward: BossReward,
): { lines: string[]; combatLeveled: boolean; pvpLeveled: boolean } {
  const lines: string[] = [];
  if (reward.xp) {
    const lvl = stats.addXp(player, reward.xp);
    lines.push(`+${reward.xp} XP PvP${lvl ? ' 🎉 LEVEL UP!' : ''}`);
  }
  if (reward.combatXp) {
    const lvl = stats.addSkillXp(player, 'combat', reward.combatXp);
    lines.push(`+${reward.combatXp} XP combat${lvl ? ' 🎉 LEVEL UP!' : ''}`);
  }
  if (reward.lootTable && reward.rolls) {
    const drops = rollLootMany(reward.lootTable, player.skills.combat.level, reward.rolls);
    if (drops.length) {
      const labels: string[] = [];
      for (const d of drops) {
        stats.addResource(player, d.itemId, d.qty);
        labels.push(`${d.template.name} ×${d.qty}`);
      }
      lines.push(`Loot: ${labels.join(', ')}`);
    }
  }
  if (reward.dropPool && reward.dropPool.length) {
    const chance = reward.guaranteedDropChance ?? 0;
    if (Math.random() < chance) {
      const baseId = reward.dropPool[Math.floor(Math.random() * reward.dropPool.length)];
      const item = rollItemInstance(baseId);
      if (item) {
        stats.addItem(player, item);
        lines.push(`Drop: ${fmtInstance(item)} \`${item.uid}\``);
      }
    }
  }
  return { lines, combatLeveled: false, pvpLeveled: false };
}
