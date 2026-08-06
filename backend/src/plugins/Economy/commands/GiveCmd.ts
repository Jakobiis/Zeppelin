import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { giveCoins } from "../functions/giveCoins.js";
import { parseAmountInput } from "../functions/parseAmountInput.js";
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

    const currentBalance = await pluginData.state.counters.getCounterValue(
      config.counter_name,
      null,
      message.author.id,
    );

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
    const feeText = result.fee > 0 ? ` (**${result.fee}** ${config.currency_name} fee taken)` : "";

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setDescription(
        `You gave ${emojiPrefix}**${result.amountSent}** ${config.currency_name} to <@!${args.user.id}>${feeText}. They received ${emojiPrefix}**${result.amountReceived}** ${config.currency_name}.\nYour new balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`,
      );

    await message.channel.send({ embeds: [embed] });
  },
});
