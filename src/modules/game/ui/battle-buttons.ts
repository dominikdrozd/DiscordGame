import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { BattleCombatant } from '../engine/battle-state.js';
import { ITEMS } from '../services/items.js';
import { listAvailableSkills } from '../skills/index.js';

export function buildActionRow(
  battleId: string,
  combatantId: string,
  disabled = false,
  hasSkills = false,
): ActionRowBuilder<ButtonBuilder> {
  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`bat:${battleId}:${combatantId}:atk`)
      .setLabel('⚔️ Atak')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bat:${battleId}:${combatantId}:def`)
      .setLabel('🛡️ Obrona')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bat:${battleId}:${combatantId}:skl`)
      .setLabel('✨ Skill')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasSkills),
    new ButtonBuilder()
      .setCustomId(`bat:${battleId}:${combatantId}:itm`)
      .setLabel('🎒 Item')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  ];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function buildSkillPickerRow(
  battleId: string,
  combatantId: string,
  combatant: BattleCombatant,
): ActionRowBuilder<ButtonBuilder> | null {
  const all = listAvailableSkills(combatant);
  if (all.length === 0) return null;
  const buttons: ButtonBuilder[] = [];
  for (const s of all) {
    const cd = combatant.skillCooldowns?.[s.id] ?? 0;
    const onCd = cd > 0;
    const label = `${s.name}${onCd ? ` (${cd}t)` : ''}`.slice(0, 80);
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`sklpick:${battleId}:${combatantId}:${s.id}`)
        .setLabel(label)
        .setStyle(onCd ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(onCd),
    );
    if (buttons.length >= 5) break;
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function buildSkillTargetRow(
  battleId: string,
  combatantId: string,
  skillId: string,
  targets: BattleCombatant[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...targets
      .slice(0, 5)
      .map((t) =>
        new ButtonBuilder()
          .setCustomId(`skltgt:${battleId}:${combatantId}:${skillId}:${t.id}`)
          .setLabel(`${t.name} (${t.hp}/${t.maxHp})`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
  );
}

export function buildItemPickerRow(
  battleId: string,
  combatantId: string,
  consumables: Record<string, number>,
  legacyPotionsLeft: number,
): ActionRowBuilder<ButtonBuilder> | null {
  const buttons: ButtonBuilder[] = [];
  for (const [itemId, qty] of Object.entries(consumables)) {
    if (qty <= 0) continue;
    const name = ITEMS[itemId]?.name ?? itemId;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`itmpick:${battleId}:${combatantId}:${itemId}`)
        .setLabel(`${name} ×${qty}`.slice(0, 80))
        .setStyle(ButtonStyle.Success),
    );
    if (buttons.length >= 5) break;
  }
  if (legacyPotionsLeft > 0 && buttons.length < 5) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`itmpick:${battleId}:${combatantId}:_legacy`)
        .setLabel(`🧪 Mikstura (start ×${legacyPotionsLeft})`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (buttons.length === 0) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function buildPanelOpenerRow(
  battleId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pnl:${battleId}`)
      .setLabel('🎮 Otwórz mój panel')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

export function buildTargetRow(
  battleId: string,
  combatantId: string,
  kind: string,
  targets: BattleCombatant[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...targets
      .slice(0, 5)
      .map((t) =>
        new ButtonBuilder()
          .setCustomId(`tgt:${battleId}:${combatantId}:${kind}:${t.id}`)
          .setLabel(`${t.name} (${t.hp}/${t.maxHp})`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
  );
}
