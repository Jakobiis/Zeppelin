import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { parseAmountInput } from "../functions/parseAmountInput.js";
import { playGame } from "../functions/playGame.js";
import { EconomyPluginType } from "../types.js";

export const PlayCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["play"],
  permission: "can_play",

  signature: {
    game: ct.string(),
    amount: ct.string(),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    const game = config.games[args.game];
    if (!game) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown game: ${args.game}`);
      return;
    }

    if (game.type !== "wager") {
      void pluginData.state.common.sendErrorMessage(
        message,
        `**${args.game}** doesn't take bets — use \`${getGuildPrefix(pluginData)}work\` instead.`,
      );
      return;
    }

    const currentBalance = await pluginData.state.counters.getCounterValue(
      config.counter_name,
      null,
      message.author.id,
    );

    let bet = parseAmountInput(args.amount, currentBalance);
    if (bet === null) {
      void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
      return;
    }

    if (args.amount.trim().toLowerCase() === "all") {
      bet = Math.min(bet, game.max_bet);
    }

    const result = await playGame(pluginData, args.game, game, message.author.id, bet);

    if (result.type === "error") {
      void pluginData.state.common.sendErrorMessage(message, result.message);
      return;
    }

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const label = game.label ?? args.game;

    const multiplierText = result.multiplier != null ? ` (**${result.multiplier.toFixed(2)}x**)` : "";

    const embed = new EmbedBuilder()
      .setColor(result.win ? 0x4caf50 : 0xe53935)
      .setDescription(
        result.win
          ? `🎉 You won on **${label}**${multiplierText}! +${emojiPrefix}**${result.amountChanged}** ${config.currency_name}\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`
          : `💸 You lost on **${label}**. -${emojiPrefix}**${Math.abs(result.amountChanged)}** ${config.currency_name}\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`,
      );

    await message.channel.send({ embeds: [embed] });
  },
});
