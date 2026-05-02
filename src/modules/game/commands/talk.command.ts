import { type ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { DialogService } from '../services/dialog.service.js';
import { getCity } from '../cities/index.js';
import { findNpcCity, getNpc } from '../npcs/index.js';
import { displayName } from '../../../utils.js';

/**
 * Cienki access-point do rozmów z NPC. Cała logika dialogu w `DialogService`.
 *
 * Użycie:
 *  - `.talk` — lista wszystkich NPC w grze (po miastach)
 *  - `.talk <city_id> <npc_id>` — rozpocznij rozmowę z konkretnym NPC w mieście
 *  - `.talk <npc_id>` — skrót (znajdź miasto NPC automatycznie)
 */
export class TalkCommand implements ICommand {
  readonly name = 'talk';
  readonly prefix = '.talk';
  readonly description =
    'Rozmowa z NPC. `.talk` — lista; `.talk <city> <npc>` — start rozmowy. Można też kliknąć NPC w `.menu` → Miasta.';
  readonly requiresPrompt = false;

  constructor(private readonly dialog: DialogService) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
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

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    await this.dialog.handleInteraction(interaction);
  }

  private renderList(): string {
    const lines: string[] = ['💬 **NPC w Quelthasee** — kliknij w `.menu` → Miasta lub:', ''];
    let total = 0;
    for (const c of [getCity('port_cykada'), getCity('oakhaven'), getCity('krasnoludzka_twierdza'), getCity('czarna_cytadela')]) {
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
