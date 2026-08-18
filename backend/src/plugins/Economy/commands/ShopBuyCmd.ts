import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { chargeBalance } from "../functions/chargeBalance.js";
import { findShopBoost } from "../functions/findShopBoost.js";
import { formatAmount } from "../functions/formatAmount.js";
import { getSpendableBalance } from "../functions/pendingBalance.js";
import { resolveShopStock } from "../functions/resolveShopStock.js";
import { EconomyPluginType } from "../types.js";

export const ShopBuyCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["shop buy"],
  permission: "can_shop",

  signature: {
    item: ct.string(),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    const userId = message.author.id;

    const entry = findShopBoost(config.shop.boosts, args.item);
    if (!entry) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown shop item: \`${args.item}\``);
      return;
    }
    const [key, boost] = entry;
    const label = boost.label ?? key;

    // Unlocked pre-check (same pattern the games use for their own bet-affordability estimate) so an obviously
    // unaffordable purchase doesn't needlessly claim a stock slot first.
    const { spendable: estimateBalance } = await getSpendableBalance(pluginData, config.counter_name, userId);
    if (estimateBalance < boost.price) {
      void pluginData.state.common.sendErrorMessage(
        message,
        `You don't have enough ${config.currency_name} for **${label}** (costs ${formatAmount(boost.price)}, balance: ${formatAmount(estimateBalance)}).`,
      );
      return;
    }

    if (boost.stock != null) {
      // Resolves (and lazily restocks) the current stock level first so the decrement below always lands on an
      // up-to-date row — decrementStock alone only ever subtracts, it never restocks by itself.
      await resolveShopStock(pluginData, key, boost);
      const decremented = await pluginData.state.shop.decrementStock(key);
      if (!decremented) {
        void pluginData.state.common.sendErrorMessage(message, `**${label}** is out of stock.`);
        return;
      }
    }

    const charged = await chargeBalance(pluginData, config.counter_name, userId, boost.price);
    if (!charged) {
      // Balance changed between the pre-check above and this actual charge (e.g. another concurrent spend) —
      // give back the stock slot we claimed, since the purchase didn't go through after all.
      if (boost.stock != null) {
        await pluginData.state.shop.incrementStock(key);
      }
      const { spendable: currentBalance } = await getSpendableBalance(pluginData, config.counter_name, userId);
      void pluginData.state.common.sendErrorMessage(
        message,
        `You don't have enough ${config.currency_name} for **${label}** (costs ${formatAmount(boost.price)}, balance: ${formatAmount(currentBalance)}).`,
      );
      return;
    }

    const durationMs = convertDelayStringToMS(boost.duration)!;
    await pluginData.state.shop.purchaseBoost(userId, boost.boost_type, key, boost.multiplier, durationMs);

    const boostTypeLabel = boost.boost_type === "coins" ? config.currency_name : "activity points";
    void pluginData.state.common.sendSuccessMessage(
      message,
      `Purchased **${label}** for ${formatAmount(boost.price)} ${config.currency_name} — **${boost.multiplier}x** ${boostTypeLabel} for ${humanizeDuration(durationMs)}.`,
    );
  },
});
