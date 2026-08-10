import { EmbedBuilder, Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { chargeBalance } from "./chargeBalance.js";
import { checkCooldown } from "./checkCooldown.js";
import { parseAmountInput } from "./parseAmountInput.js";
import { PlayPvpBotMatchFn, PvpBotMatchContext } from "./pvpBotMatch.js";
import { playDiceDuelVsBot } from "./pvpDiceDuelVsBot.js";
import { playRockPaperScissorsVsBot } from "./pvpRockPaperScissorsVsBot.js";
import { playTicTacToeVsBot } from "./pvpTicTacToeVsBot.js";
import { EconomyPluginType, zEconomyPvpGame } from "../types.js";

const VARIANT_HANDLERS: Record<z.infer<typeof zEconomyPvpGame>["variant"], PlayPvpBotMatchFn> = {
  rock_paper_scissors: playRockPaperScissorsVsBot,
  dice_duel: playDiceDuelVsBot,
  tic_tac_toe: playTicTacToeVsBot,
};

export async function runPvpVsBot(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  gameName: string,
  game: z.infer<typeof zEconomyPvpGame>,
  amountArg: string,
): Promise<void> {
  const config = pluginData.config.get();
  const playerId = message.author.id;
  const label = game.label ?? gameName;
  const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

  // Shares the same cooldown bucket as challenging a real player, keyed by game+player, so switching to "vs bot"
  // isn't a way to sidestep the cooldown.
  const cooldownKey = `${gameName}:${playerId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    void pluginData.state.common.sendErrorMessage(message, cooldownCheck.message);
    return;
  }

  const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, playerId);

  let amount = parseAmountInput(amountArg, balance);
  if (amount === null) {
    void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
    return;
  }

  if (amountArg.trim().toLowerCase() === "all") {
    amount = Math.min(amount, game.max_bet);
  }

  if (amount < game.min_bet || amount > game.max_bet) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `Bet must be between ${game.min_bet} and ${game.max_bet} ${config.currency_name}`,
    );
    return;
  }

  const charged = await chargeBalance(pluginData, config.counter_name, playerId, amount);
  if (!charged) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `You don't have enough ${config.currency_name} for that bet (balance: ${balance})`,
    );
    return;
  }

  if (cooldownCheck.cooldownMs) {
    pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
  }

  const ctx: PvpBotMatchContext = {
    pluginData,
    channel: message.channel,
    playerId,
    amount,
    label,
    emojiPrefix,
    currencyName: config.currency_name,
  };

  const outcome = await VARIANT_HANDLERS[game.variant](ctx);

  if (outcome.type === "win") {
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, playerId, amount * 2);
  } else if (outcome.type === "push") {
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, playerId, amount);
  }
  // "loss" — the bet was already deducted up front and isn't returned; nothing left to settle

  const balanceAfter = await pluginData.state.counters.getCounterValue(config.counter_name, null, playerId);
  const resultTag = outcome.type === "win" ? "🏆 Won" : outcome.type === "push" ? "🤝 Push" : "💀 Lost";

  const net = outcome.type === "win" ? amount : outcome.type === "loss" ? -amount : 0;
  const netText = net > 0 ? `+${emojiPrefix}**${net}**` : net < 0 ? `-${emojiPrefix}**${Math.abs(net)}**` : `${emojiPrefix}**0**`;

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x0159b2)
        .setTitle("Final Balance")
        .setDescription(
          `${resultTag} — <@${playerId}>\n` +
            `Net: ${netText} ${config.currency_name}\n` +
            `New balance: ${emojiPrefix}**${balanceAfter}** ${config.currency_name}`,
        ),
    ],
  });
}
