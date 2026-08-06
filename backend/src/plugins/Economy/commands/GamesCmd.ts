import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { EconomyPluginType } from "../types.js";

export const GamesCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["games"],
  permission: "can_view",

  signature: {},

  async run({ pluginData, message }) {
    const config = pluginData.config.get();
    const gameEntries = Object.entries(config.games);

    if (!gameEntries.length) {
      void pluginData.state.common.sendErrorMessage(message, "No games are configured on this server.");
      return;
    }

    const lines = gameEntries.map(([gameName, game]) => {
      const label = game.label ?? gameName;
      const emojiPrefix = game.emoji ? `${game.emoji} ` : "";
      const winPercent = Math.round(game.win_chance * 100);
      const cooldownMs = game.cooldown ? convertDelayStringToMS(game.cooldown) : null;
      const cooldownText = cooldownMs ? `, cooldown ${humanizeDuration(cooldownMs)}` : "";

      return `${emojiPrefix}**${label}** (\`${gameName}\`) — ${winPercent}% to win **${game.win_multiplier}x**, bet ${game.min_bet}-${game.max_bet} ${config.currency_name}${cooldownText}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle("Games")
      .setDescription(`${lines.join("\n")}\n\nUse \`${getGuildPrefix(pluginData)}play <game> <amount>\` to play.`);

    await message.channel.send({ embeds: [embed] });
  },
});
