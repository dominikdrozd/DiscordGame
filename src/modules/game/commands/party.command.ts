import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from 'discord.js';
import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PartyService, MAX_PARTY } from '../services/party.js';
import { displayName } from '../../../utils.js';

export class PartyCommand implements ICommand {
  readonly name = 'party';
  readonly prefix = '.party';
  readonly description =
    'Party. `.party` status; `.party create` (zostajesz liderem); `.party invite @user`; `.party leave`; `.party kick @user`; `.party disband` (lider). Max ' +
    MAX_PARTY +
    ' osób.';
  readonly requiresPrompt = false;

  constructor(private readonly party: PartyService) {}

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
    const sub = args[0] ?? '';

    if (!sub) {
      const party = this.party.getByMember(msg.author.id);
      if (!party) {
        await msg.reply('Nie jesteś w party. Użyj `.party create` lub poczekaj na zaproszenie.');
        return;
      }
      const lead = party.leaderId === msg.author.id ? ' (Ty — lider)' : '';
      await msg.reply(
        [
          `🎯 **Party** \`${party.id}\`${lead}`,
          `Lider: <@${party.leaderId}>`,
          `Członkowie (${party.members.length}/${MAX_PARTY}): ${party.members.map((id) => `<@${id}>`).join(', ')}`,
          party.pendingInvites.length
            ? `Zaproszenia oczekujące: ${party.pendingInvites.map((id) => `<@${id}>`).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }

    if (sub === 'create') {
      if (this.party.getByMember(msg.author.id)) {
        await msg.reply('Już jesteś w party. Użyj `.party leave` najpierw.');
        return;
      }
      const party = this.party.create(msg.author.id);
      await msg.reply(`🎯 Party \`${party.id}\` założone — jesteś liderem. Zapraszaj przez \`.party invite @user\`.`);
      return;
    }

    if (sub === 'invite') {
      const target = msg.mentions?.users?.first();
      if (!target) {
        await msg.reply('Użycie: `.party invite @user`.');
        return;
      }
      if (target.bot) {
        await msg.reply('Bota nie zapraszaj, sam się tu wpadnie.');
        return;
      }
      const myParty = this.party.getByMember(msg.author.id);
      if (!myParty) {
        await msg.reply('Najpierw załóż party przez `.party create`.');
        return;
      }
      const result = this.party.invite(myParty.id, msg.author.id, target.id);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się zaprosić.');
        return;
      }
      try {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`party:${myParty.id}:accept`)
            .setLabel('✅ Akceptuj')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`party:${myParty.id}:decline`)
            .setLabel('❌ Odrzuć')
            .setStyle(ButtonStyle.Danger),
        );
        await target.send({
          content: `🎯 **${displayName(msg)}** zaprasza Cię do party \`${myParty.id}\`.`,
          components: [row],
        });
        await msg.reply(`Wysłano zaproszenie do <@${target.id}>.`);
      } catch {
        await msg.reply(
          `Zaproszenie zarejestrowane, ale DM zablokowany. <@${target.id}> niech użyje \`.party accept ${myParty.id}\`.`,
        );
      }
      return;
    }

    if (sub === 'accept') {
      const partyId = args[1];
      if (!partyId) {
        const inv = this.party.getByPendingInvite(msg.author.id);
        if (!inv) {
          await msg.reply('Brak otwartych zaproszeń. Użycie: `.party accept <partyId>`.');
          return;
        }
        const result = this.party.accept(inv.id, msg.author.id);
        await this.replyAccept(msg, result);
        return;
      }
      const result = this.party.accept(partyId, msg.author.id);
      await this.replyAccept(msg, result);
      return;
    }

    if (sub === 'decline') {
      const partyId = args[1];
      const inv = partyId ? this.party.get(partyId) : this.party.getByPendingInvite(msg.author.id);
      if (!inv) {
        await msg.reply('Brak takiego zaproszenia.');
        return;
      }
      this.party.decline(inv.id, msg.author.id);
      await msg.reply(`Odrzucono zaproszenie do \`${inv.id}\`.`);
      return;
    }

    if (sub === 'leave') {
      const result = this.party.leave(msg.author.id);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wyjść.');
        return;
      }
      await msg.reply(result.partyDisbanded ? 'Wyszedłeś — party rozwiązane.' : 'Wyszedłeś z party.');
      return;
    }

    if (sub === 'kick') {
      const target = msg.mentions?.users?.first();
      if (!target) {
        await msg.reply('Użycie: `.party kick @user`.');
        return;
      }
      const myParty = this.party.getByMember(msg.author.id);
      if (!myParty) {
        await msg.reply('Nie jesteś w party.');
        return;
      }
      const result = this.party.kick(myParty.id, msg.author.id, target.id);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się wyrzucić.');
        return;
      }
      await msg.reply(`Wyrzucono <@${target.id}>.`);
      return;
    }

    if (sub === 'disband') {
      const myParty = this.party.getByMember(msg.author.id);
      if (!myParty) {
        await msg.reply('Nie jesteś w party.');
        return;
      }
      const result = this.party.disband(myParty.id, msg.author.id);
      if (!result.ok) {
        await msg.reply(result.reason ?? 'Nie udało się rozwiązać.');
        return;
      }
      await msg.reply('Party rozwiązane.');
      return;
    }

    await msg.reply('Użycie: `.party` / `.party create` / `.party invite @user` / `.party accept` / `.party decline` / `.party leave` / `.party kick @user` / `.party disband`.');
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('party:')) return;
    const [, partyId, action] = interaction.customId.split(':');
    if (action === 'accept') {
      const result = this.party.accept(partyId, interaction.user.id);
      if (!result.ok) {
        await interaction
          .reply({ content: result.reason ?? 'Nie udało się dołączyć.', ephemeral: true })
          .catch(() => {});
        return;
      }
      await interaction
        .update({
          content: `✅ Dołączyłeś do party \`${partyId}\`.`,
          components: [],
        })
        .catch(() => {});
      return;
    }
    if (action === 'decline') {
      this.party.decline(partyId, interaction.user.id);
      await interaction
        .update({ content: `❌ Odrzucono zaproszenie do \`${partyId}\`.`, components: [] })
        .catch(() => {});
      return;
    }
  }

  private async replyAccept(msg: any, result: { ok: boolean; reason?: string; party?: any }): Promise<void> {
    if (!result.ok) {
      await msg.reply(result.reason ?? 'Nie udało się dołączyć.');
      return;
    }
    await msg.reply(`✅ Dołączyłeś do party \`${result.party.id}\`.`);
  }
}
