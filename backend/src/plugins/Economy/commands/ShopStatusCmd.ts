import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { EconomyPluginType } from "../types.js";
import { getGuildPrefix } from "utils/getGuildPrefix.js";

export const ShopStatusCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["shop status", "shop boosts"],
  permission: "can_shop",

  signature: {},

  async run({ pluginData, message }) {
    const config = pluginData.config.get();
    const userId = message.author.id;
    const prefix = getGuildPrefix(pluginData);
    const [coinsBoost, activityBoost] = await Promise.all([
      pluginData.state.shop.getActiveBoost(userId, "coins"),
      pluginData.state.shop.getActiveBoost(userId, "activity"),
    ]);

    if (!coinsBoost && !activityBoost) {
      void message.channel.send(`You don't have any active boosts. Check \`${prefix}shop\` to buy one.`);
      return;
    }

    const lines: string[] = [];
    for (const [boost, typeLabel] of [
      [coinsBoost, config.currency_name],
      [activityBoost, "activity points"],
    ] as const) {
      if (!boost) continue;
      const remainingMs = boost.expiresAt.getTime() - Date.now();
      const boostConfig = config.shop.boosts[boost.boostKey];
      const label = boostConfig?.label ?? boost.boostKey;
      lines.push(`**${label}**: ${boost.multiplier}x ${typeLabel} — ${humanizeDuration(Math.max(0, remainingMs), { round: true })} left`);
    }

    const embed = new EmbedBuilder().setColor(getGuildEmbedColor(pluginData)).setTitle("Active Boosts").setDescription(lines.join("\n"));

    await message.channel.send({ embeds: [embed] });
  },
});
