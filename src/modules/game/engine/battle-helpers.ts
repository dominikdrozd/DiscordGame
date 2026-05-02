import { type ButtonInteraction } from 'discord.js';
import type { BattleCombatant, BattleState } from './battle-state.js';
import { findCombatant, aliveAllies, aliveEnemies } from './battle-state.js';
import { consumablesUsed } from './player-combatant.js';
import type { PlayerStatsService } from '../services/player-stats.js';
import { ITEMS } from '../services/items.js';
import { buildItemPickerRow, buildSkillPickerRow, buildSkillTargetRow } from '../ui/battle-buttons.js';
import { getSkill, isOnCooldown } from '../skills/index.js';

export async function openItemPicker(
  interaction: ButtonInteraction,
  battleId: string,
  combatantId: string,
  combatant: BattleCombatant,
): Promise<void> {
  const consumables = combatant.consumables ?? {};
  const row = buildItemPickerRow(battleId, combatantId, consumables, combatant.potionsLeft);
  if (!row) {
    await interaction
      .reply({ content: 'Brak itemów do użycia w combat.', ephemeral: true })
      .catch(() => {});
    return;
  }
  await interaction
    .reply({ content: 'Wybierz item:', ephemeral: true, components: [row] })
    .catch(() => {});
}

export async function recordItemPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, itemId] = interaction.customId.split(':');
  if (state.id !== battleId) return false;
  if (interaction.user.id !== combatantId) return false;
  if (state.pending.has(combatantId)) return false;
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) return false;

  if (itemId === '_legacy') {
    if (me.potionsLeft <= 0) {
      await interaction
        .update({ content: 'Brak miksturek startowych.', components: [] })
        .catch(() => {});
      return false;
    }
    state.pending.set(combatantId, { kind: 'item' });
    await interaction
      .update({ content: 'Wybrałeś: 🧪 Mikstura.', components: [] })
      .catch(() => {});
    return true;
  }

  const have = me.consumables?.[itemId] ?? 0;
  if (have <= 0) {
    await interaction
      .update({ content: 'Brak takiego itemu w plecaku.', components: [] })
      .catch(() => {});
    return false;
  }
  state.pending.set(combatantId, { kind: 'item', itemId });
  const name = ITEMS[itemId]?.name ?? itemId;
  await interaction
    .update({ content: `Wybrałeś: **${name}**.`, components: [] })
    .catch(() => {});
  return true;
}

export async function openSkillPicker(
  interaction: ButtonInteraction,
  battleId: string,
  combatantId: string,
  combatant: BattleCombatant,
): Promise<void> {
  const row = buildSkillPickerRow(battleId, combatantId, combatant);
  if (!row) {
    await interaction
      .reply({ content: 'Brak skilli — wybierz klasę przez `.class pick <id>`.', ephemeral: true })
      .catch(() => {});
    return;
  }
  await interaction
    .reply({ content: 'Wybierz skill:', ephemeral: true, components: [row] })
    .catch(() => {});
}

export async function handleSkillPick(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, skillId] = interaction.customId.split(':');
  if (state.id !== battleId) return false;
  if (interaction.user.id !== combatantId) return false;
  if (state.pending.has(combatantId)) return false;
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) return false;
  const skill = getSkill(skillId);
  if (!skill) {
    await interaction.update({ content: 'Nieznany skill.', components: [] }).catch(() => {});
    return false;
  }
  if (isOnCooldown(me, skillId)) {
    await interaction.update({ content: 'Skill na cooldownie.', components: [] }).catch(() => {});
    return false;
  }

  // self / allEnemies / allAllies — od razu rejestrujemy
  if (skill.targeting === 'self' || skill.targeting === 'allEnemies' || skill.targeting === 'allAllies') {
    state.pending.set(combatantId, { kind: 'skill', skillId });
    await interaction
      .update({ content: `Wybrano: **${skill.name}**.`, components: [] })
      .catch(() => {});
    return true;
  }

  // ally / enemy — pokazujemy target picker
  const targets =
    skill.targeting === 'enemy' ? aliveEnemies(state, me) : aliveAllies(state, me);
  if (targets.length === 0) {
    await interaction
      .update({ content: 'Brak żywych celów dla tego skilla.', components: [] })
      .catch(() => {});
    return false;
  }
  if (targets.length === 1) {
    state.pending.set(combatantId, { kind: 'skill', skillId, targetId: targets[0].id });
    await interaction
      .update({ content: `Wybrano: **${skill.name}** → **${targets[0].name}**.`, components: [] })
      .catch(() => {});
    return true;
  }
  const row = buildSkillTargetRow(battleId, combatantId, skillId, targets);
  await interaction
    .update({ content: `Cel dla **${skill.name}**:`, components: [row] })
    .catch(() => {});
  return false;
}

export async function handleSkillTarget(
  interaction: ButtonInteraction,
  state: BattleState,
): Promise<boolean> {
  const [, battleId, combatantId, skillId, targetId] = interaction.customId.split(':');
  if (state.id !== battleId) return false;
  if (interaction.user.id !== combatantId) return false;
  if (state.pending.has(combatantId)) return false;
  const me = findCombatant(state, combatantId);
  if (!me || me.hp <= 0) return false;
  const skill = getSkill(skillId);
  if (!skill) return false;
  const target = findCombatant(state, targetId);
  if (!target || target.hp <= 0) {
    await interaction.update({ content: 'Cel padł.', components: [] }).catch(() => {});
    return false;
  }
  state.pending.set(combatantId, { kind: 'skill', skillId, targetId });
  await interaction
    .update({ content: `Wybrano: **${skill.name}** → **${target.name}**.`, components: [] })
    .catch(() => {});
  return true;
}

export function syncConsumablesAfterBattle(
  stats: PlayerStatsService,
  state: BattleState,
): void {
  let changed = false;
  for (const c of state.combatants) {
    if (c.controller !== 'human' || !c.consumablesStart) continue;
    const used = consumablesUsed(c.consumablesStart, c.consumables ?? {});
    if (Object.keys(used).length === 0) continue;
    const player = stats.get(c.id, c.name);
    for (const [itemId, qty] of Object.entries(used)) {
      stats.removeResource(player, itemId, qty);
    }
    changed = true;
  }
  if (changed) stats.save();
}
