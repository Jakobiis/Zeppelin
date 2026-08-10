import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message, MessageComponentInteraction, OmitPartialGroupDMChannel, User } from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { MINUTES, noop } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { chargeBalance } from "./chargeBalance.js";
import { checkCooldown } from "./checkCooldown.js";
import { formatAmount } from "./formatAmount.js";
import { logGameHistory } from "./gameHistory.js";
import { parseAmountInput } from "./parseAmountInput.js";
import { applyGameHold, getSpendableBalance } from "./pendingBalance.js";
import { playDiceDuel } from "./pvpDiceDuel.js";
import { PlayPvpMatchFn, PvpMatchContext } from "./pvpMatch.js";
import { playRockPaperScissors } from "./pvpRockPaperScissors.js";
import { playTicTacToe } from "./pvpTicTacToe.js";
import { isPvpDisabled } from "./pvpToggle.js";
import { EconomyPluginType, zEconomyPvpGame } from "../types.js";

const CHALLENGE_TIMEOUT = 2 * MINUTES;

const VARIANT_HANDLERS: Record<z.infer<typeof zEconomyPvpGame>["variant"], PlayPvpMatchFn> = {
  rock_paper_scissors: playRockPaperScissors,
  dice_duel: playDiceDuel,
  tic_tac_toe: playTicTacToe,
};

export async function runPvpGame(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  gameName: string,
  game: z.infer<typeof zEconomyPvpGame>,
  opponent: User,
  amountArg: string,
): Promise<void> {
  const config = pluginData.config.get();
  const challengerId = message.author.id;
  const label = game.label ?? gameName;
  const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

  if (opponent.id === challengerId) {
    void pluginData.state.common.sendErrorMessage(message, "You can't challenge yourself");
    return;
  }

  if (opponent.bot) {
    void pluginData.state.common.sendErrorMessage(message, "You can't challenge a bot");
    return;
  }

  if (await isPvpDisabled(pluginData, opponent.id)) {
    void pluginData.state.common.sendErrorMessage(message, `${opponent.username} isn't accepting PvP challenges.`);
    return;
  }

  const cooldownKey = `${gameName}:${challengerId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    void pluginData.state.common.sendErrorMessage(message, cooldownCheck.message);
    return;
  }

  const { spendable: challengerBalance } = await getSpendableBalance(pluginData, config.counter_name, challengerId);

  let amount = parseAmountInput(amountArg, challengerBalance);
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

  if (challengerBalance < amount) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `You don't have enough ${config.currency_name} for that bet (balance: ${formatAmount(challengerBalance)})`,
    );
    return;
  }

  const idBase = `pvpChallenge:${message.id}`;
  const challengeText = `<@${challengerId}> is challenging <@${opponent.id}> to **${label}** for ${emojiPrefix}**${formatAmount(amount)}** ${config.currency_name}!`;

  const buildChallengeEmbed = (extra?: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${label} Challenge`)
      .setDescription(extra ? `${challengeText}\n\n${extra}` : challengeText);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
    new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Accept").setCustomId(`${idBase}:accept`),
    new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel("Decline").setCustomId(`${idBase}:decline`),
  ]);

  const challengeMessage = await message.channel.send({
    content: `<@${opponent.id}>`,
    embeds: [buildChallengeEmbed()],
    components: [row],
  });

  const accepted = await new Promise<boolean>((resolve) => {
    let settled = false;

    const collector = challengeMessage.createMessageComponentCollector({
      time: CHALLENGE_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(idBase),
    });

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== opponent.id) {
        await interaction.reply({ content: "This challenge isn't for you.", ephemeral: true }).catch(noop);
        return;
      }

      if (settled) return;
      settled = true;
      collector.stop();

      const action = interaction.customId.slice(idBase.length + 1);
      if (action === "accept") {
        await interaction.update({ embeds: [buildChallengeEmbed("✅ Accepted!")], components: [] }).catch(noop);
        resolve(true);
      } else {
        await interaction
          .update({ embeds: [buildChallengeEmbed(`❌ Declined by <@${opponent.id}>.`)], components: [] })
          .catch(noop);
        resolve(false);
      }
    });

    collector.on("end", async () => {
      if (settled) return;
      settled = true;
      await challengeMessage
        .edit({ embeds: [buildChallengeEmbed("⌛ Challenge expired.")], components: [] })
        .catch(noop);
      resolve(false);
    });
  });

  if (!accepted) return;

  const challengerCharged = await chargeBalance(pluginData, config.counter_name, challengerId, amount);
  if (!challengerCharged) {
    await message.channel.send(
      `<@${challengerId}> no longer has enough ${config.currency_name} for this bet — match cancelled.`,
    );
    return;
  }

  const opponentCharged = await chargeBalance(pluginData, config.counter_name, opponent.id, amount);
  if (!opponentCharged) {
    // Refund the challenger since the match can't proceed
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, challengerId, amount);
    await message.channel.send(
      `<@${opponent.id}> doesn't have enough ${config.currency_name} for this bet — match cancelled.`,
    );
    return;
  }

  if (cooldownCheck.cooldownMs) {
    pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
  }

  const ctx: PvpMatchContext = {
    pluginData,
    channel: message.channel,
    challengerId,
    opponentId: opponent.id,
    amount,
    label,
    emojiPrefix,
    currencyName: config.currency_name,
  };

  const outcome = await VARIANT_HANDLERS[game.variant](ctx);

  if (outcome.type === "push") {
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, challengerId, amount);
    await pluginData.state.counters.changeCounterValue(config.counter_name, null, opponent.id, amount);
  } else {
    const settleLock = await pluginData.locks.acquire(economyUserLock({ id: outcome.winnerId }));
    try {
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, outcome.winnerId, amount * 2);
      // amount*2 pays back the winner's own stake plus the loser's — only the loser's half is actual "winnings"
      await applyGameHold(pluginData, outcome.winnerId, amount, game.hold);
    } finally {
      settleLock.unlock();
    }
  }

  const challengerBalanceAfter = await pluginData.state.counters.getCounterValue(
    config.counter_name,
    null,
    challengerId,
  );
  const opponentBalanceAfter = await pluginData.state.counters.getCounterValue(config.counter_name, null, opponent.id);

  const outcomeFor = (userId: string): "win" | "loss" | "push" => {
    if (outcome.type === "push") return "push";
    return outcome.winnerId === userId ? "win" : "loss";
  };

  await logGameHistory(pluginData, {
    userId: challengerId,
    gameName,
    gameType: "pvp",
    outcome: outcomeFor(challengerId),
    betAmount: amount,
    amountChanged: outcomeFor(challengerId) === "win" ? amount : outcomeFor(challengerId) === "loss" ? -amount : 0,
    balanceAfter: challengerBalanceAfter,
    opponentId: opponent.id,
  });
  await logGameHistory(pluginData, {
    userId: opponent.id,
    gameName,
    gameType: "pvp",
    outcome: outcomeFor(opponent.id),
    betAmount: amount,
    amountChanged: outcomeFor(opponent.id) === "win" ? amount : outcomeFor(opponent.id) === "loss" ? -amount : 0,
    balanceAfter: opponentBalanceAfter,
    opponentId: challengerId,
  });

  const resultTag = (userId: string): string => {
    if (outcome.type === "push") return "🤝 Push";
    return outcome.winnerId === userId ? "🏆 Won" : "💀 Lost";
  };

  const netFor = (userId: string): number => {
    if (outcome.type === "push") return 0;
    return outcome.winnerId === userId ? amount : -amount;
  };

  const formatNet = (net: number): string => {
    if (net > 0) return `+${emojiPrefix}**${formatAmount(net)}**`;
    if (net < 0) return `-${emojiPrefix}**${formatAmount(Math.abs(net))}**`;
    return `${emojiPrefix}**0**`;
  };

  const playerBlock = (userId: string, balance: number): string =>
    `${resultTag(userId)} — <@${userId}>\n` +
    `Net: ${formatNet(netFor(userId))} ${config.currency_name}\n` +
    `New balance: ${emojiPrefix}**${formatAmount(balance)}** ${config.currency_name}`;

  // Displayed balances exclude anything just put on hold, so the embed doesn't show coins the winner can't
  // actually spend yet.
  const { spendable: challengerSpendableAfter } = await getSpendableBalance(
    pluginData,
    config.counter_name,
    challengerId,
  );
  const { spendable: opponentSpendableAfter } = await getSpendableBalance(pluginData, config.counter_name, opponent.id);

  const description = [
    playerBlock(challengerId, challengerSpendableAfter),
    playerBlock(opponent.id, opponentSpendableAfter),
  ].join("\n\n");

  await message.channel.send({
    embeds: [new EmbedBuilder().setColor(0x0159b2).setTitle("Final Balances").setDescription(description)],
  });
}
