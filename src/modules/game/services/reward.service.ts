import { PlayerStatsService } from './player-stats.js';
import { rollLootMany } from './loot.js';
import { rollItemInstance, fmtInstance } from './items.js';
import type { BossReward } from '../engine/encounters.js';
import { getSkill } from '../skills/index.js';

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
  if (reward.bookDrops && reward.bookDrops.length) {
    for (const book of reward.bookDrops) {
      if (Math.random() >= book.chance) continue;
      const skill = getSkill(book.skillId);
      if (!skill) continue;
      if (stats.hasLearnedSkill(player, skill.id)) {
        lines.push(`📜 Drop: **Księga: ${skill.name}** (już znasz — duplikat odrzucony).`);
        continue;
      }
      const added = stats.grantBook(player, skill.id);
      if (!added) {
        lines.push(`📜 Drop: **Księga: ${skill.name}** (już masz tę księgę).`);
        continue;
      }
      const reqStr = formatRequirementsCompact(skill);
      lines.push(
        `📜✨ **DROP KSIĘGI:** **${skill.name}** — użyj \`/skills learn ${skill.id}\` (wymaga: ${reqStr}).`,
      );
    }
  }
  return { lines, combatLeveled: false, pvpLeveled: false };
}

function formatRequirementsCompact(skill: { requirements?: { level: number; primary?: Partial<Record<string, number>> } }): string {
  const r = skill.requirements;
  if (!r) return 'brak wymagań';
  const parts: string[] = [`lvl ${r.level}`];
  if (r.primary) {
    for (const [k, v] of Object.entries(r.primary)) {
      if (v) parts.push(`${k.toUpperCase()} ${v}`);
    }
  }
  return parts.join(' · ');
}
