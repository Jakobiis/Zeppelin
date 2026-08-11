import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  OmitPartialGroupDMChannel,
} from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { MINUTES, noop } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { chargeBalance } from "./chargeBalance.js";
import { checkCooldown } from "./checkCooldown.js";
import { formatAmount } from "./formatAmount.js";
import { GameHistoryOutcome, logGameHistory } from "./gameHistory.js";
import { parseAmountInput } from "./parseAmountInput.js";
import { applyGameHold, getSpendableBalance } from "./pendingBalance.js";
import { EconomyPluginType, zEconomyHolGame } from "../types.js";

const ROUND_TIMEOUT = 5 * MINUTES;

// Draws are independent each round (not depleted like an actual deck) — "Same" therefore always has 1/13 odds,
// no matter how many rounds have already passed.
const RANGE_MAX = 13;

type Choice = "higher" | "lower" | "same";

const CHOICE_LABEL: Record<Choice, string> = { higher: "Higher", lower: "Lower", same: "Same" };
const CHOICE_EMOJI: Record<Choice, string> = { higher: "⬆️", lower: "⬇️", same: "🎯" };

function rollNumber(): number {
  return 1 + Math.floor(Math.random() * RANGE_MAX);
}

// The "fair" multiplier for a choice is 1/probability (a break-even payout given its true odds), clamped into
// the configured range so an easy guess is never trivial and a rare guess never pays out absurdly. Returns null
// for an impossible choice (0% odds) — the caller disables that button entirely.
function computeMultiplier(probability: number, min: number, max: number): number | null {
  if (probability <= 0) return null;
  return Math.min(max, Math.max(min, 1 / probability));
}

function roundMultipliers(current: number, min: number, max: number): Record<Choice, number | null> {
  const higherCount = RANGE_MAX - current;
  const lowerCount = current - 1;
  return {
    higher: computeMultiplier(higherCount / RANGE_MAX, min, max),
    lower: computeMultiplier(lowerCount / RANGE_MAX, min, max),
    same: computeMultiplier(1 / RANGE_MAX, min, max),
  };
}

export async function runHigherOrLower(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  gameName: string,
  game: z.infer<typeof zEconomyHolGame>,
  amountArg: string,
): Promise<void> {
  const config = pluginData.config.get();
  const userId = message.author.id;
  const label = game.label ?? gameName;
  const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
  const idBase = `hol:${message.id}`;

  const cooldownKey = `${gameName}:${userId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    void pluginData.state.common.sendErrorMessage(message, cooldownCheck.message);
    return;
  }

  const { spendable: estimateBalance } = await getSpendableBalance(pluginData, config.counter_name, userId);

  let bet = parseAmountInput(amountArg, estimateBalance);
  if (bet === null) {
    void pluginData.state.common.sendErrorMessage(message, `Amount must be a positive whole number, or "all"`);
    return;
  }

  if (amountArg.trim().toLowerCase() === "all") {
    bet = Math.min(bet, game.max_bet);
  }

  if (bet < game.min_bet || bet > game.max_bet) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `Bet must be between ${game.min_bet} and ${game.max_bet} ${config.currency_name}`,
    );
    return;
  }

  const charged = await chargeBalance(pluginData, config.counter_name, userId, bet);
  if (!charged) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `You don't have enough ${config.currency_name} for that bet (balance: ${formatAmount(estimateBalance)})`,
    );
    return;
  }

  if (cooldownCheck.cooldownMs) {
    pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
  }

  let currentNumber = rollNumber();
  let totalMultiplier = 1;
  let roundIndex = 0;

  const potentialPayout = (multiplier: number): number => {
    const rawPayout = Math.floor(bet * multiplier);
    if (game.max_payout == null) return rawPayout;
    return bet + Math.min(rawPayout - bet, game.max_payout);
  };

  const buildDescription = (extra?: string): string => {
    const multipliers = roundMultipliers(currentNumber, game.min_multiplier, game.max_multiplier);
    const buttonLines = (Object.keys(CHOICE_LABEL) as Choice[])
      .map((choice) => {
        const mult = multipliers[choice];
        return mult == null ? null : `${CHOICE_EMOJI[choice]} **${CHOICE_LABEL[choice]}**: ${mult.toFixed(2)}x`;
      })
      .filter((line): line is string => line !== null)
      .join("  ·  ");

    const progressLine =
      roundIndex > 0
        ? `Current multiplier: **${totalMultiplier.toFixed(2)}x** (cash out for ${emojiPrefix}**${formatAmount(potentialPayout(totalMultiplier))}**)\n`
        : "";

    return (
      `Round ${roundIndex + 1} — the number is **${currentNumber}** (1-${RANGE_MAX})\n` +
      `${progressLine}${buttonLines}` +
      (extra ? `\n\n${extra}` : "")
    );
  };

  const buildEmbed = (extra?: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setTitle(label)
      .setDescription(buildDescription(extra));

  const buildButtons = (disabled = false): ActionRowBuilder<ButtonBuilder> => {
    const multipliers = roundMultipliers(currentNumber, game.min_multiplier, game.max_multiplier);
    const buttons = (Object.keys(CHOICE_LABEL) as Choice[]).map((choice) =>
      new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setEmoji(CHOICE_EMOJI[choice])
        .setLabel(CHOICE_LABEL[choice])
        .setCustomId(`${idBase}:${choice}`)
        .setDisabled(disabled || multipliers[choice] == null),
    );
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setLabel("Cash Out")
        .setCustomId(`${idBase}:cashout`)
        .setDisabled(disabled || roundIndex === 0),
    );
    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  };

  const sentMessage = await message.channel.send({ embeds: [buildEmbed()], components: [buildButtons()] });

  let finished = false;

  const settle = async (
    outcome: GameHistoryOutcome,
    payout: number,
    interaction: MessageComponentInteraction | null,
    resultText: string,
  ): Promise<void> => {
    finished = true;

    if (payout > 0) {
      const settleLock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
      try {
        await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, payout);
        const netWinnings = payout - bet;
        if (netWinnings > 0) {
          await applyGameHold(pluginData, userId, netWinnings, game.hold);
        }
      } finally {
        settleLock.unlock();
      }
    }

    const totalAfter = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
    await logGameHistory(pluginData, {
      userId,
      gameName,
      gameType: "hol",
      outcome,
      betAmount: bet,
      amountChanged: payout - bet,
      balanceAfter: totalAfter,
    });

    // Displayed balance excludes anything just put on hold, so the embed doesn't show coins the player can't
    // actually spend yet.
    const { spendable: newBalance } = await getSpendableBalance(pluginData, config.counter_name, userId);
    const description = `${resultText}\nNew balance: ${emojiPrefix}**${formatAmount(newBalance)}** ${config.currency_name}`;
    const embed = buildEmbed(description);
    const payload = { embeds: [embed], components: [buildButtons(true)] };

    if (interaction) {
      await interaction.update(payload).catch(noop);
    } else {
      await sentMessage.edit(payload).catch(noop);
    }
  };

  const collector = sentMessage.createMessageComponentCollector({
    time: ROUND_TIMEOUT,
    filter: (interaction) => interaction.customId.startsWith(idBase),
  });

  collector.on("collect", async (interaction: MessageComponentInteraction) => {
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: "This isn't your game.", ephemeral: true }).catch(noop);
      return;
    }

    if (finished) return;

    const action = interaction.customId.slice(idBase.length + 1) as Choice | "cashout";

    if (action === "cashout") {
      if (roundIndex === 0) {
        await interaction.deferUpdate().catch(noop);
        return;
      }
      collector.stop();
      const payout = potentialPayout(totalMultiplier);
      await settle(
        "win",
        payout,
        interaction,
        `💰 Cashed out at **${totalMultiplier.toFixed(2)}x**! +${emojiPrefix}**${formatAmount(payout - bet)}** ${config.currency_name}`,
      );
      return;
    }

    const multipliers = roundMultipliers(currentNumber, game.min_multiplier, game.max_multiplier);
    const chosenMultiplier = multipliers[action];
    if (chosenMultiplier == null) {
      await interaction.deferUpdate().catch(noop);
      return;
    }

    const drawnNumber = rollNumber();
    const correct =
      (action === "higher" && drawnNumber > currentNumber) ||
      (action === "lower" && drawnNumber < currentNumber) ||
      (action === "same" && drawnNumber === currentNumber);

    if (!correct) {
      collector.stop();
      currentNumber = drawnNumber;
      await settle("loss", 0, interaction, `❌ The number was **${drawnNumber}** — you lost your bet.`);
      return;
    }

    totalMultiplier *= chosenMultiplier;
    roundIndex += 1;
    currentNumber = drawnNumber;

    await interaction.update({ embeds: [buildEmbed()], components: [buildButtons()] }).catch(noop);
  });

  collector.on("end", async (_collected, reason) => {
    if (finished || reason === "stopped") return;

    if (roundIndex === 0) {
      // Never made a guess — refund the bet in full rather than treating inactivity as a loss.
      await settle("push", bet, null, "⌛ Timed out before your first guess. Bet refunded.");
      return;
    }

    // Auto cash-out at the current multiplier rather than losing an already-earned streak to inactivity.
    const payout = potentialPayout(totalMultiplier);
    await settle(
      "win",
      payout,
      null,
      `⌛ Timed out — automatically cashed out at **${totalMultiplier.toFixed(2)}x**.`,
    );
  });
}
