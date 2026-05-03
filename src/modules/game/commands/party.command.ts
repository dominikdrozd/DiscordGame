import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { PartyService, MAX_PARTY } from '../services/party.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

export class PartyCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'party';
  readonly prefix = '.party';
  readonly description =
    'Party. `.party` / `/party status`; `create`; `invite @user`; `leave`; `kick @user`; `disband`. Max ' +
    MAX_PARTY +
    ' osób.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('party')
    .setDescription('Party — zarządzanie drużyną PvP/PvE')
    .addSubcommand((sc) => sc.setName('status').setDescription('Pokaż swoją party'))
    .addSubcommand((sc) =>
      sc.setName('create').setDescription('Stwórz nową party (zostajesz liderem)'),
    )
    .addSubcommand((sc) =>
      sc
        .setName('invite')
        .setDescription('Zaproś gracza (lider only)')
        .addUserOption((o) =>
          o.setName('user').setDescription('Gracz do zaproszenia').setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('accept')
        .setDescription('Akceptuj zaproszenie')
        .addStringOption((o) =>
          o.setName('party_id').setDescription('id party (opcjonalne)').setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('decline')
        .setDescription('Odrzuć zaproszenie')
        .addStringOption((o) =>
          o.setName('party_id').setDescription('id party (opcjonalne)').setRequired(false),
        ),
    )
    .addSubcommand((sc) => sc.setName('leave').setDescription('Wyjdź z party'))
    .addSubcommand((sc) =>
      sc
        .setName('kick')
        .setDescription('Wywal członka (lider only)')
        .addUserOption((o) =>
          o.setName('user').setDescription('Gracz do wywalenia').setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName('disband').setDescription('Rozwiąż party (lider only)'))
    .toJSON();

  constructor(private readonly party: PartyService) {
    super();
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
      await msg.reply(
        `🎯 Party \`${party.id}\` założone — jesteś liderem. Zapraszaj przez \`.party invite @user\`.`,
      );
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
      await msg.reply(
        result.partyDisbanded ? 'Wyszedłeś — party rozwiązane.' : 'Wyszedłeś z party.',
      );
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

    await msg.reply(
      'Użycie: `.party` / `.party create` / `.party invite @user` / `.party accept` / `.party decline` / `.party leave` / `.party kick @user` / `.party disband`.',
    );
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const userName = interaction.user.globalName || interaction.user.username;

    if (sub === 'status') {
      await this.replyEphemeral(interaction, this.renderStatus(userId));
      return;
    }
    if (sub === 'create') {
      await this.replyEphemeral(interaction, this.tryCreate(userId));
      return;
    }
    if (sub === 'invite') {
      const target = interaction.options.getUser('user', true);
      const result = this.tryInvite(userId, userName, target.id, target.bot);
      if (!result.ok || !result.partyId) {
        await this.replyEphemeral(interaction, result.message);
        return;
      }
      try {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`party:${result.partyId}:accept`)
            .setLabel('✅ Akceptuj')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`party:${result.partyId}:decline`)
            .setLabel('❌ Odrzuć')
            .setStyle(ButtonStyle.Danger),
        );
        await target.send({
          content: `🎯 **${userName}** zaprasza Cię do party \`${result.partyId}\`.`,
          components: [row],
        });
        await this.replyEphemeral(interaction, `Wysłano zaproszenie do <@${target.id}>.`);
      } catch {
        await this.replyEphemeral(
          interaction,
          `Zaproszenie zarejestrowane, ale DM zablokowany. <@${target.id}> niech użyje \`/party accept party_id:${result.partyId}\`.`,
        );
      }
      return;
    }
    if (sub === 'accept') {
      const partyIdArg = interaction.options.getString('party_id') ?? undefined;
      await this.replyEphemeral(interaction, this.tryAccept(userId, partyIdArg));
      return;
    }
    if (sub === 'decline') {
      const partyIdArg = interaction.options.getString('party_id') ?? undefined;
      await this.replyEphemeral(interaction, this.tryDecline(userId, partyIdArg));
      return;
    }
    if (sub === 'leave') {
      await this.replyEphemeral(interaction, this.tryLeave(userId));
      return;
    }
    if (sub === 'kick') {
      const target = interaction.options.getUser('user', true);
      await this.replyEphemeral(interaction, this.tryKick(userId, target.id));
      return;
    }
    if (sub === 'disband') {
      await this.replyEphemeral(interaction, this.tryDisband(userId));
    }
  }

  private async replyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string,
  ): Promise<void> {
    await interaction
      .reply({ content, flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  private renderStatus(userId: string): string {
    const party = this.party.getByMember(userId);
    if (!party) {
      return 'Nie jesteś w party. Użyj `/party create` lub poczekaj na zaproszenie.';
    }
    const lead = party.leaderId === userId ? ' (Ty — lider)' : '';
    return [
      `🎯 **Party** \`${party.id}\`${lead}`,
      `Lider: <@${party.leaderId}>`,
      `Członkowie (${party.members.length}/${MAX_PARTY}): ${party.members.map((id) => `<@${id}>`).join(', ')}`,
      party.pendingInvites.length
        ? `Zaproszenia oczekujące: ${party.pendingInvites.map((id) => `<@${id}>`).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private tryCreate(userId: string): string {
    if (this.party.getByMember(userId)) {
      return 'Już jesteś w party. Użyj `/party leave` najpierw.';
    }
    const party = this.party.create(userId);
    return `🎯 Party \`${party.id}\` założone — jesteś liderem. Zapraszaj przez \`/party invite\`.`;
  }

  private tryInvite(
    userId: string,
    _userName: string,
    targetId: string,
    targetIsBot: boolean,
  ): { ok: boolean; message: string; partyId?: string } {
    void _userName;
    if (targetIsBot) return { ok: false, message: 'Bota nie zapraszaj, sam się tu wpadnie.' };
    const myParty = this.party.getByMember(userId);
    if (!myParty) return { ok: false, message: 'Najpierw załóż party przez `/party create`.' };
    const result = this.party.invite(myParty.id, userId, targetId);
    if (!result.ok) return { ok: false, message: result.reason ?? 'Nie udało się zaprosić.' };
    return { ok: true, message: '', partyId: myParty.id };
  }

  private tryAccept(userId: string, partyIdArg: string | undefined): string {
    let partyId = partyIdArg;
    if (!partyId) {
      const inv = this.party.getByPendingInvite(userId);
      if (!inv) return 'Brak otwartych zaproszeń. Podaj `party_id` w komendzie.';
      partyId = inv.id;
    }
    const result = this.party.accept(partyId, userId);
    if (!result.ok) return result.reason ?? 'Nie udało się dołączyć.';
    return `✅ Dołączyłeś do party \`${result.party?.id ?? partyId}\`.`;
  }

  private tryDecline(userId: string, partyIdArg: string | undefined): string {
    const inv = partyIdArg ? this.party.get(partyIdArg) : this.party.getByPendingInvite(userId);
    if (!inv) return 'Brak takiego zaproszenia.';
    this.party.decline(inv.id, userId);
    return `Odrzucono zaproszenie do \`${inv.id}\`.`;
  }

  private tryLeave(userId: string): string {
    const result = this.party.leave(userId);
    if (!result.ok) return result.reason ?? 'Nie udało się wyjść.';
    return result.partyDisbanded ? 'Wyszedłeś — party rozwiązane.' : 'Wyszedłeś z party.';
  }

  private tryKick(userId: string, targetId: string): string {
    const myParty = this.party.getByMember(userId);
    if (!myParty) return 'Nie jesteś w party.';
    const result = this.party.kick(myParty.id, userId, targetId);
    if (!result.ok) return result.reason ?? 'Nie udało się wyrzucić.';
    return `Wyrzucono <@${targetId}>.`;
  }

  private tryDisband(userId: string): string {
    const myParty = this.party.getByMember(userId);
    if (!myParty) return 'Nie jesteś w party.';
    const result = this.party.disband(myParty.id, userId);
    if (!result.ok) return result.reason ?? 'Nie udało się rozwiązać.';
    return 'Party rozwiązane.';
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

  private async replyAccept(
    msg: any,
    result: { ok: boolean; reason?: string; party?: any },
  ): Promise<void> {
    if (!result.ok) {
      await msg.reply(result.reason ?? 'Nie udało się dołączyć.');
      return;
    }
    await msg.reply(`✅ Dołączyłeś do party \`${result.party.id}\`.`);
  }
}
