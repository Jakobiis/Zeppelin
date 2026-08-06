import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { MINUTES, noop } from "../../../utils.js";
import { buildEconomyInfoEmbed } from "../functions/buildEconomyInfoEmbed.js";
import { EconomyPluginType } from "../types.js";

const INFO_BUTTON_TIMEOUT = 5 * MINUTES;

export const BalanceCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["balance", "coins", "bal"],
  permission: "can_view",

  signature: {
    user: ct.resolvedUser({ required: false }),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    const targetUser = args.user ?? message.author;
    const isSelf = targetUser.id === message.author.id;

    const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, targetUser.id);

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const who = isSelf ? "You have" : `${targetUser.username} has`;

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setDescription(`${who} ${emojiPrefix}**${balance}** ${config.currency_name}`);

    const infoCustomId = `economyInfo:${message.id}`;
    const infoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❔")
        .setLabel("How It Works")
        .setCustomId(infoCustomId),
    );

    const sentMessage = await message.channel.send({ embeds: [embed], components: [infoRow] });

    const collector = sentMessage.createMessageComponentCollector({
      time: INFO_BUTTON_TIMEOUT,
      filter: (interaction) => interaction.customId === infoCustomId,
    });

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction
          .reply({ content: "You are not permitted to use this button.", ephemeral: true })
          .catch(noop);
        return;
      }

      const infoEmbed = await buildEconomyInfoEmbed(pluginData, message);
      await interaction.reply({ embeds: [infoEmbed], ephemeral: true }).catch(noop);
    });

    collector.on("end", () => {
      sentMessage.edit({ components: [] }).catch(noop);
    });
  },
});
