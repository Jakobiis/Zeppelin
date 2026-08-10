import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { formatAmount } from "../functions/formatAmount.js";
import { parseAmountInput } from "../functions/parseAmountInput.js";
import { getSpendableBalance } from "../functions/pendingBalance.js";
import { playGame } from "../functions/playGame.js";
import { runBlackjack } from "../functions/runBlackjack.js";
import { runPvpGame } from "../functions/pvpChallenge.js";
import { runPvpVsBot } from "../functions/pvpVsBot.js";
import { EconomyPluginType } from "../types.js";

export const PlayCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["play"],
  permission: "can_play",

  signature: [
    {
      game: ct.string(),
      amount: ct.string(),
    },
    {
      game: ct.string(),
      user: ct.resolvedUser(),
      amount: ct.string(),
    },
  ],

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    const game = config.games[args.game];
    if (!game) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown game: ${args.game}`);
      return;
    }

    if (game.type === "pvp") {
      if (!args.user) {
        await runPvpVsBot(pluginData, message, args.game, game, args.amount);
        return;
      }
      await runPvpGame(pluginData, message, args.game, game, args.user, args.amount);
      return;
    }

    if (args.user) {
      void pluginData.state.common.sendErrorMessage(message, `**${args.game}** isn't a PvP game.`);
      return;
    }

    if (game.type === "blackjack") {
      await runBlackjack(pluginData, message, args.game, game, args.amount);
      return;
    }

    if (game.type !== "wager") {
      void pluginData.state.common.sendErrorMessage(
        message,
        `**${args.game}** doesn't take bets — use \`${getGuildPrefix(pluginData)}work\` instead.`,
      );
      return;
    }

    const { spendable: currentBalance } = await getSpendableBalance(pluginData, config.counter_name, message.author.id);

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
          ? `🎉 You won on **${label}**${multiplierText}! +${emojiPrefix}**${formatAmount(result.amountChanged)}** ${config.currency_name}\nNew balance: ${emojiPrefix}**${formatAmount(result.newBalance)}** ${config.currency_name}`
          : `💸 You lost on **${label}**. -${emojiPrefix}**${formatAmount(Math.abs(result.amountChanged))}** ${config.currency_name}\nNew balance: ${emojiPrefix}**${formatAmount(result.newBalance)}** ${config.currency_name}`,
      );

    await message.channel.send({ embeds: [embed] });
  },
});
