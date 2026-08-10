import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { formatAmount } from "../functions/formatAmount.js";
import { giveCoins } from "../functions/giveCoins.js";
import { parseAmountInput } from "../functions/parseAmountInput.js";
import { getSpendableBalance } from "../functions/pendingBalance.js";
import { EconomyPluginType } from "../types.js";

export const GiveCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["give"],
  permission: "can_give",

  signature: {
    user: ct.resolvedUser(),
    amount: ct.string(),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();

    if (args.user.id === message.author.id) {
      void pluginData.state.common.sendErrorMessage(message, "You can't give coins to yourself");
      return;
    }

    if (args.user.bot) {
      void pluginData.state.common.sendErrorMessage(message, "You can't give coins to a bot");
      return;
    }

    const { spendable: currentBalance } = await getSpendableBalance(pluginData, config.counter_name, message.author.id);

    const amount = parseAmountInput(args.amount, currentBalance);
    if (amount === null) {
      void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
      return;
    }

    const result = await giveCoins(pluginData, message.author.id, args.user.id, amount);

    if (result.type === "error") {
      void pluginData.state.common.sendErrorMessage(message, result.message);
      return;
    }

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setTitle("Gift Sent")
      .setDescription(`To <@${args.user.id}>`)
      .addFields(
        { name: "Sent", value: `${emojiPrefix}**${formatAmount(result.amountSent)}**`, inline: true },
        { name: "They Received", value: `${emojiPrefix}**${formatAmount(result.amountReceived)}**`, inline: true },
        { name: "Your Balance", value: `${emojiPrefix}**${formatAmount(result.newBalance)}**`, inline: true },
      );

    if (result.fee > 0) {
      embed.setFooter({ text: `${formatAmount(result.fee)} ${config.currency_name} fee applied` });
    }

    await message.channel.send({ embeds: [embed] });
  },
});
