import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { formatRewardAmount, formatWinMultiplier } from "../functions/numberOrRange.js";
import { EconomyPluginType } from "../types.js";

const PVP_VARIANT_NAMES = {
  rock_paper_scissors: "Rock Paper Scissors",
  dice_duel: "Dice Duel",
  tic_tac_toe: "Tic Tac Toe",
};

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

    const prefix = getGuildPrefix(pluginData);

    const lines = gameEntries.map(([gameName, game]) => {
      const label = game.label ?? gameName;
      const emojiPrefix = game.emoji ? `${game.emoji} ` : "";
      const cooldownMs = game.cooldown ? convertDelayStringToMS(game.cooldown) : null;
      const cooldownText = cooldownMs ? `, cooldown ${humanizeDuration(cooldownMs)}` : "";

      if (game.type === "reward") {
        const winText =
          game.win_chance >= 1 ? "Guaranteed" : `${Math.round(game.win_chance * 100)}% chance for`;
        return `${emojiPrefix}**${label}** (\`${prefix}work\`) — ${winText} **${formatRewardAmount(game.reward)}** ${config.currency_name}${cooldownText}`;
      }

      if (game.type === "blackjack") {
        return `${emojiPrefix}**${label}** (\`${prefix}play ${gameName} <amount>\`) — standard blackjack, pays **${game.blackjack_payout}x** on a natural, bet ${game.min_bet}-${game.max_bet} ${config.currency_name}${cooldownText}`;
      }

      if (game.type === "pvp") {
        const variantName = PVP_VARIANT_NAMES[game.variant];
        return `${emojiPrefix}**${label}** (\`${prefix}play ${gameName} @user <amount>\`) — ${variantName}, bet ${game.min_bet}-${game.max_bet} ${config.currency_name}${cooldownText}`;
      }

      const winPercent = Math.round(game.win_chance * 100);
      return `${emojiPrefix}**${label}** (\`${prefix}play ${gameName} <amount>\`) — ${winPercent}% to win **${formatWinMultiplier(game.win_multiplier)}**, bet ${game.min_bet}-${game.max_bet} ${config.currency_name}${cooldownText}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle("Games")
      .setDescription(lines.join("\n"));

    await message.channel.send({ embeds: [embed] });
  },
});
