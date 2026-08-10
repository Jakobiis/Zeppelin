import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { MINUTES, noop } from "../../../utils.js";
import { buildEconomyInfoEmbed } from "../functions/buildEconomyInfoEmbed.js";
import { formatAmount } from "../functions/formatAmount.js";
import { getSpendableBalance } from "../functions/pendingBalance.js";
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

    const { total, pending, spendable, pendingUnlocksAt } = await getSpendableBalance(
      pluginData,
      config.counter_name,
      targetUser.id,
    );

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const pendingValue =
      pending > 0 && pendingUnlocksAt
        ? `${emojiPrefix}**${formatAmount(pending)}**\nUnlocks <t:${Math.floor(pendingUnlocksAt / 1000)}:R>`
        : `${emojiPrefix}**${formatAmount(pending)}**`;

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
      .addFields(
        { name: "Spendable", value: `${emojiPrefix}**${formatAmount(spendable)}**`, inline: true },
        { name: "Pending", value: pendingValue, inline: true },
        { name: "Total", value: `${emojiPrefix}**${formatAmount(total)}**`, inline: true },
      );

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
