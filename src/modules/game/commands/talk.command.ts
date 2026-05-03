import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { DialogService } from '../services/dialog.service.js';
import { getCity, listCities } from '../cities/index.js';
import { findNpcCity, getNpc } from '../npcs/index.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

/**
 * Cienki access-point do rozmów z NPC. Cała logika dialogu w `DialogService`.
 *
 * Użycie:
 *  - `.talk` / `/talk list` — lista wszystkich NPC w grze (po miastach)
 *  - `.talk <city_id> <npc_id>` / `/talk start npc:<id>` — start rozmowy
 *  - `.talk <npc_id>` — skrót (znajdź miasto NPC automatycznie)
 */
export class TalkCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'talk';
  readonly prefix = '.talk';
  readonly description =
    'Rozmowa z NPC. `.talk` lista, `.talk <city> <npc>` start. `/talk list|start` ephemeral.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('talk')
    .setDescription('Rozmowa z NPC')
    .addSubcommand((sc) => sc.setName('list').setDescription('Lista NPC w grze'))
    .addSubcommand((sc) =>
      sc
        .setName('start')
        .setDescription('Rozpocznij rozmowę z NPC')
        .addStringOption((o) =>
          o
            .setName('npc')
            .setDescription('id NPC (np. marek)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .toJSON();

  constructor(private readonly dialog: DialogService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const args = prompt.split(/\s+/).filter(Boolean);

    if (args.length === 0) {
      await msg.reply(this.renderList());
      return;
    }

    let cityId: string | undefined;
    let npcId: string;
    if (args.length === 1) {
      npcId = args[0];
      const placement = findNpcCity(npcId);
      if (placement) cityId = placement.cityId;
    } else {
      cityId = args[0];
      npcId = args[1];
    }

    if (cityId) {
      const city = getCity(cityId);
      if (!city) {
        await msg.reply(`Nie ma miasta \`${cityId}\`. Wpisz \`.city\` żeby zobaczyć listę.`);
        return;
      }
      const npc = city.findNpc(npcId);
      if (!npc) {
        await msg.reply(
          `W **${city.name}** nie ma NPC \`${npcId}\`. Wpisz \`.talk\` żeby zobaczyć kto gdzie jest.`,
        );
        return;
      }
    } else {
      if (!getNpc(npcId)) {
        await msg.reply(`Nie znam NPC \`${npcId}\`. Wpisz \`.talk\` żeby zobaczyć listę.`);
        return;
      }
    }

    await this.dialog.startFromCommand(msg, displayName(msg), npcId);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'npc') return;
    const q = focused.value.toLowerCase();
    const npcs: { id: string; name: string }[] = [];
    for (const c of listCities()) {
      for (const npc of c.npcs) npcs.push({ id: npc.id, name: npc.name });
    }
    const choices = npcs
      .filter((n) => n.id.includes(q) || n.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((n) => ({ name: `${n.name} (${n.id})`.slice(0, 100), value: n.id }));
    await interaction.respond(choices).catch(() => {});
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      await interaction
        .reply({ content: this.renderList(), flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const npcId = interaction.options.getString('npc', true);
    if (!getNpc(npcId)) {
      await interaction
        .reply({
          content: `Nie znam NPC \`${npcId}\`. Wpisz \`/talk list\` żeby zobaczyć listę.`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    await this.dialog.startFromSlash(interaction, npcId);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    await this.dialog.handleInteraction(interaction);
  }

  private renderList(): string {
    const lines: string[] = ['💬 **NPC w Quelthasee** — kliknij w `.menu` → Miasta lub:', ''];
    let total = 0;
    for (const c of [
      getCity('port_cykada'),
      getCity('oakhaven'),
      getCity('krasnoludzka_twierdza'),
      getCity('czarna_cytadela'),
    ]) {
      if (!c) continue;
      if (c.npcs.length === 0) continue;
      lines.push(`**${c.name}** (\`${c.id}\`):`);
      for (const npc of c.npcs) {
        lines.push(`  • \`${npc.id}\` — **${npc.name}** — ${npc.description}`);
        total++;
      }
    }
    if (total === 0) {
      lines.push('_Na razie żaden NPC nie chce z tobą gadać._');
    } else {
      lines.push('', 'Użycie: `.talk <city_id> <npc_id>` lub po prostu `.talk <npc_id>`.');
    }
    return lines.join('\n');
  }
}
