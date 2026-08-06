import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { parseAmountInput } from "../functions/parseAmountInput.js";
import { tradeCoins } from "../functions/tradeCoins.js";
import { EconomyPluginType } from "../types.js";

export const TradeCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["trade"],
  permission: "can_trade",

  signature: {
    direction: ct.string(),
    amount: ct.string(),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    if (!config.trade) {
      void pluginData.state.common.sendErrorMessage(message, "Trading isn't configured on this server.");
      return;
    }

    const direction = args.direction.trim().toLowerCase();
    if (direction !== "buy" && direction !== "sell") {
      void pluginData.state.common.sendErrorMessage(
        message,
        `Direction must be "buy" (points → ${config.currency_name}) or "sell" (${config.currency_name} → points)`,
      );
      return;
    }

    const balanceCounterName = direction === "buy" ? config.trade.points_counter_name : config.counter_name;
    const currentBalance = await pluginData.state.counters.getCounterValue(
      balanceCounterName,
      null,
      message.author.id,
    );

    const amount = parseAmountInput(args.amount, currentBalance);
    if (amount === null) {
      void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
      return;
    }

    const result = await tradeCoins(pluginData, direction, message.author.id, amount);

    if (result.type === "error") {
      void pluginData.state.common.sendErrorMessage(message, result.message);
      return;
    }

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setDescription(
        result.direction === "buy"
          ? `Spent **${result.spent}** points for ${emojiPrefix}**${result.received}** ${config.currency_name}.\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`
          : `Sold ${emojiPrefix}**${result.spent}** ${config.currency_name} for **${result.received}** points.\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`,
      );

    await message.channel.send({ embeds: [embed] });
  },
});
