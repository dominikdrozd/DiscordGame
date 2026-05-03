import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { SpellsService } from '../services/spells.service.js';
import { SKILLS } from '../skills/index.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { BaseCommand } from './base.command.js';

export class SpellsCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'spells';
  readonly prefix = '.spells';
  readonly description =
    'Browser spelli — klasowe + super (drop z bossów). `/spells` lub `/spells learn <id>`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('spells')
    .setDescription('Browser spelli — klasowe + super (drop z bossów)')
    .addSubcommand((sc) =>
      sc.setName('show').setDescription('Otwórz browser spelli (klasowe / super)'),
    )
    .addSubcommand((sc) =>
      sc
        .setName('learn')
        .setDescription('Naucz się konkretnego spella')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('id spella (autocomplete)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .toJSON();

  constructor(
    private readonly spells: SpellsService,
    private readonly stats: PlayerStatsService,
  ) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(
      msg.author.id,
      msg.author.globalName ?? msg.author.username ?? msg.author.id,
    );
    const parts = prompt.split(/\s+/).filter(Boolean);
    if (parts[0] === 'learn' && parts[1]) {
      const skill = SKILLS[parts[1]];
      if (!skill) {
        await msg.reply(`Nie ma spella \`${parts[1]}\`.`);
        return;
      }
      const result = this.spells.learn(player, skill);
      this.stats.save();
      await msg.reply(result);
      return;
    }
    await msg.reply(
      'Browser spelli dostępny przez `/spells` lub button **✨ Spelle** w `.menu`. CLI: `.spells learn <id>`.',
    );
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    if (sub === 'show') {
      await this.spells.openFromSlash(interaction);
      return;
    }
    if (sub === 'learn') {
      const id = interaction.options.getString('id', true);
      const skill = SKILLS[id];
      if (!skill) {
        await interaction
          .reply({ content: `Nie ma spella \`${id}\`.`, flags: MessageFlags.Ephemeral })
          .catch(() => {});
        return;
      }
      const result = this.spells.learn(player, skill);
      this.stats.save();
      await interaction.reply({ content: result, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('spl:')) return;
    await this.spells.handleInteraction(interaction as ButtonInteraction);
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (interaction.options.getSubcommand() !== 'learn') return;
    const focus = interaction.options.getFocused().toLowerCase();
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    // sugerujemy: spelle dostępne dla klasy gracza + super-spelle z księgą
    const candidates = Object.values(SKILLS).filter((s) => {
      if (player.learnedSkills.includes(s.id)) return false;
      if (s.universal) return player.unlearnedBooks.includes(s.id);
      if (!player.classId) return false;
      const sub1 = player.subclassId;
      const sub2 = player.subclass2Id;
      return (
        s.classes.includes(player.classId) ||
        (sub1 ? s.classes.includes(sub1) : false) ||
        (sub2 ? s.classes.includes(sub2) : false)
      );
    });
    const filtered = candidates
      .filter(
        (s) => !focus || s.id.toLowerCase().includes(focus) || s.name.toLowerCase().includes(focus),
      )
      .slice(0, 25)
      .map((s) => ({ name: `${s.name} (${s.id})`.slice(0, 100), value: s.id }));
    await interaction.respond(filtered).catch(() => {});
  }
}
