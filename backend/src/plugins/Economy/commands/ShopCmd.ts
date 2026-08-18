import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { formatAmount } from "../functions/formatAmount.js";
import { resolveShopStock } from "../functions/resolveShopStock.js";
import { EconomyPluginType } from "../types.js";

export const ShopCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["shop"],
  permission: "can_shop",

  signature: {},

  async run({ pluginData, message }) {
    const config = pluginData.config.get();
    const boostEntries = Object.entries(config.shop.boosts);

    if (!boostEntries.length) {
      void pluginData.state.common.sendErrorMessage(message, "The shop is empty right now.");
      return;
    }

    const lines = await Promise.all(
      boostEntries.map(async ([key, boost]) => {
        const label = boost.label ?? key;
        const emojiPrefix = boost.emoji ? `${boost.emoji} ` : "";
        const stock = await resolveShopStock(pluginData, key, boost);
        const stockText = stock == null ? "" : stock > 0 ? ` — **${stock}** in stock` : " — **Out of stock**";
        const durationMs = convertDelayStringToMS(boost.duration) ?? 0;
        const boostTypeLabel = boost.boost_type === "coins" ? config.currency_name : "activity points";

        return (
          `${emojiPrefix}**${label}** (\`${key}\`) — ${formatAmount(boost.price)} ${config.currency_name}${stockText}\n` +
          `${boost.multiplier}x ${boostTypeLabel} for ${humanizeDuration(durationMs)}`
        );
      }),
    );

    const prefix = getGuildPrefix(pluginData);
    const embed = new EmbedBuilder()
      .setColor(getGuildEmbedColor(pluginData))
      .setTitle("Shop")
      .setDescription(`${lines.join("\n\n")}\n\nBuy with \`${prefix}shop buy <item>\``);

    await message.channel.send({ embeds: [embed] });
  },
});
