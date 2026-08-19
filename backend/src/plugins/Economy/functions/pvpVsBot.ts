import { EmbedBuilder, Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { chargeBalance } from "./chargeBalance.js";
import { checkCooldown } from "./checkCooldown.js";
import { formatAmount } from "./formatAmount.js";
import { logGameHistory } from "./gameHistory.js";
import { isAllOrMaxKeyword, parseAmountInput } from "./parseAmountInput.js";
import { applyGameHold, getSpendableBalance } from "./pendingBalance.js";
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

  const { spendable: balance } = await getSpendableBalance(pluginData, config.counter_name, playerId);

  let amount = parseAmountInput(amountArg, balance);
  if (amount === null) {
    void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
    return;
  }

  if (isAllOrMaxKeyword(amountArg)) {
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
      `You don't have enough ${config.currency_name} for that bet (balance: ${formatAmount(balance)})`,
    );
    return;
  }

  if (cooldownCheck.cooldownMs) {
    pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
  }

  const ctx: PvpBotMatchContext = {
    pluginData,
    channel: message.channel,
    player: message.author,
    playerId,
    amount,
    label,
    emojiPrefix,
    currencyName: config.currency_name,
  };

  const outcome = await VARIANT_HANDLERS[game.variant](ctx);

  if (outcome.type === "win") {
    const settleLock = await pluginData.locks.acquire(economyUserLock({ id: playerId }));
    try {
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, playerId, amount * 2);
      // amount*2 returns the player's own stake plus their winnings — only the winnings half is held
      await applyGameHold(pluginData, playerId, amount, game.hold);
    } finally {
      settleLock.unlock();
    }
  } else if (outcome.type === "push") {
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, playerId, amount);
  }
  // "loss" — the bet was already deducted up front and isn't returned; nothing left to settle

  const totalAfter = await pluginData.state.counters.getCounterValue(config.counter_name, null, playerId);
  const resultTag = outcome.type === "win" ? "🏆 Won" : outcome.type === "push" ? "🤝 Push" : "💀 Lost";

  const net = outcome.type === "win" ? amount : outcome.type === "loss" ? -amount : 0;

  await logGameHistory(pluginData, {
    userId: playerId,
    gameName,
    gameType: "pvp",
    outcome: outcome.type,
    betAmount: amount,
    amountChanged: net,
    balanceAfter: totalAfter,
    opponentId: "bot",
  });

  // Displayed balance excludes anything just put on hold, so the embed doesn't show coins the player can't
  // actually spend yet.
  const { spendable: balanceAfter } = await getSpendableBalance(pluginData, config.counter_name, playerId);

  const netText =
    net > 0
      ? `+${emojiPrefix}**${formatAmount(net)}**`
      : net < 0
        ? `-${emojiPrefix}**${formatAmount(Math.abs(net))}**`
        : `${emojiPrefix}**0**`;

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x0159b2)
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle("Final Balance")
        .setDescription(
          `${resultTag}\n` +
            `Net: ${netText} ${config.currency_name}\n` +
            `New balance: ${emojiPrefix}**${formatAmount(balanceAfter)}** ${config.currency_name}`,
        ),
    ],
  });
}
