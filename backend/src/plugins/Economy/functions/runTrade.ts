import { EmbedBuilder, Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";
import { formatAmount } from "./formatAmount.js";
import { parseAmountInput } from "./parseAmountInput.js";
import { getSpendableBalance } from "./pendingBalance.js";
import { TradeDirection, tradeCoins } from "./tradeCoins.js";

/**
 * Shared by TradeCmd (points -> coins) and TradeBackCmd (coins -> points) — each just calls this with a fixed
 * `direction` instead of exposing "buy"/"sell" as a command argument, since which currency is being "bought" vs
 * "sold" was a common point of confusion.
 */
export async function runTrade(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  direction: TradeDirection,
  rawAmount: string,
): Promise<void> {
  const config = pluginData.config.get();
  if (!config.trade) {
    void pluginData.state.common.sendErrorMessage(message, "Trading isn't configured on this server.");
    return;
  }

  const balanceCounterName = direction === "buy" ? config.trade.points_counter_name : config.counter_name;
  const { spendable: currentBalance } = await getSpendableBalance(pluginData, balanceCounterName, message.author.id);

  const amount = parseAmountInput(rawAmount, currentBalance);
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
        ? `Spent **${formatAmount(result.spent)}** points for ${emojiPrefix}**${formatAmount(result.received)}** ${config.currency_name}.\nNew balance: ${emojiPrefix}**${formatAmount(result.newBalance)}** ${config.currency_name}`
        : `Sold ${emojiPrefix}**${formatAmount(result.spent)}** ${config.currency_name} for **${formatAmount(result.received)}** points.\nNew balance: ${emojiPrefix}**${formatAmount(result.newBalance)}** ${config.currency_name}`,
    );

  await message.channel.send({ embeds: [embed] });
}
