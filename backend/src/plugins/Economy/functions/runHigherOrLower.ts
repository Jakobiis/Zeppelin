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

const ROUND_TIMEOUT = 10 * MINUTES;

type Choice = "higher" | "lower" | "same";

const CHOICE_LABEL: Record<Choice, string> = { higher: "Higher", lower: "Lower", same: "Same" };
const CHOICE_EMOJI: Record<Choice, string> = { higher: "⬆️", lower: "⬇️", same: "🎯" };

function rollNumber(rangeMax: number): number {
  return 1 + Math.floor(Math.random() * rangeMax);
}

// How many correct guesses it takes for the per-round ceiling to reach the configured max_multiplier — before
// that, the ceiling ramps up linearly from min_multiplier instead of being available immediately on round 1.
// Without this, the very first guess of a round already gets full access to max_multiplier merely by landing on
// a number near either edge of the range, which doesn't feel earned this early.
const RAMP_ROUNDS = 5;

// The ceiling a round's multiplier is allowed to reach, given how many correct guesses have already happened
// this game (0 on the very first guess). Reaches the full configured max_multiplier once RAMP_ROUNDS correct
// guesses in a row have happened, and stays there for any round after that.
function effectiveMaxMultiplier(roundIndex: number, min: number, max: number): number {
  const progress = Math.min(1, (roundIndex + 1) / RAMP_ROUNDS);
  return min + (max - min) * progress;
}

// The "fair" multiplier for a choice is 1/probability (a break-even payout given its true odds), clamped into
// [min, effectiveMax] so an easy guess is never trivial and a rare guess never pays out more than this round is
// allowed to. Returns null for an impossible choice (0% odds) — the caller disables that button entirely.
function computeMultiplier(probability: number, min: number, effectiveMax: number): number | null {
  if (probability <= 0) return null;
  return Math.min(effectiveMax, Math.max(min, 1 / probability));
}

// Draws are independent each round (not depleted like an actual deck) — "Same" therefore always has 1/rangeMax
// odds, no matter how many rounds have already passed.
function roundMultipliers(
  current: number,
  rangeMax: number,
  roundIndex: number,
  min: number,
  max: number,
): Record<Choice, number | null> {
  const effectiveMax = effectiveMaxMultiplier(roundIndex, min, max);
  const higherCount = rangeMax - current;
  const lowerCount = current - 1;
  return {
    higher: computeMultiplier(higherCount / rangeMax, min, effectiveMax),
    lower: computeMultiplier(lowerCount / rangeMax, min, effectiveMax),
    same: computeMultiplier(1 / rangeMax, min, effectiveMax),
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

  let currentNumber = rollNumber(game.range_max);
  // The multiplier a cash-out would pay right now — set (not compounded) to whichever choice was just guessed
  // correctly, so it never exceeds max_multiplier no matter how many rounds have been won in a row. Surviving
  // more rounds raises the *ceiling* this can reach (via the ramp above), not the value itself.
  let currentMultiplier = 1;
  let roundIndex = 0;

  const potentialPayout = (multiplier: number): number => {
    const rawPayout = Math.floor(bet * multiplier);
    if (game.max_payout == null) return rawPayout;
    return bet + Math.min(rawPayout - bet, game.max_payout);
  };

  const buildDescription = (extra?: string): string => {
    const multipliers = roundMultipliers(currentNumber, game.range_max, roundIndex, game.min_multiplier, game.max_multiplier);
    const buttonLines = (Object.keys(CHOICE_LABEL) as Choice[])
      .map((choice) => {
        const mult = multipliers[choice];
        return mult == null ? null : `${CHOICE_EMOJI[choice]} **${CHOICE_LABEL[choice]}**: ${mult.toFixed(2)}x`;
      })
      .filter((line): line is string => line !== null)
      .join("  ·  ");

    const progressLine =
      roundIndex > 0
        ? `Current multiplier: **${currentMultiplier.toFixed(2)}x** (cash out for ${emojiPrefix}**${formatAmount(potentialPayout(currentMultiplier))}**)\n`
        : "";

    // Deliberately doesn't say what the range is — combined with a specific number, that makes it obvious how
    // close to an edge you are (e.g. "23 (1-25)" all but announces Lower is the safe bet). The multipliers
    // already communicate the odds; spelling out the range on top of that is redundant and too easy to read.
    return (
      `Round ${roundIndex + 1} — the number is **${currentNumber}**\n` +
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
    const multipliers = roundMultipliers(currentNumber, game.range_max, roundIndex, game.min_multiplier, game.max_multiplier);
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

  // Sets `finished` and stops the collector together, in that order, as the very first thing this does — a
  // caller that stopped the collector first and only set `finished` afterward left a window where discord.js's
  // synchronous `collector.stop()` -> `emit("end", ...)` could re-enter this same settlement logic from the
  // "end" handler below before `finished` was true, running a second (wrong) settlement on top of the first —
  // e.g. a loss immediately overwritten by the "end" handler's timeout-refund/auto-cashout path.
  const settle = async (
    outcome: GameHistoryOutcome,
    payout: number,
    interaction: MessageComponentInteraction | null,
    resultText: string,
  ): Promise<void> => {
    if (finished) return;
    finished = true;
    collector.stop();

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
      const payout = potentialPayout(currentMultiplier);
      await settle(
        "win",
        payout,
        interaction,
        `💰 Cashed out at **${currentMultiplier.toFixed(2)}x**! +${emojiPrefix}**${formatAmount(payout - bet)}** ${config.currency_name}`,
      );
      return;
    }

    const multipliers = roundMultipliers(currentNumber, game.range_max, roundIndex, game.min_multiplier, game.max_multiplier);
    const chosenMultiplier = multipliers[action];
    if (chosenMultiplier == null) {
      await interaction.deferUpdate().catch(noop);
      return;
    }

    const drawnNumber = rollNumber(game.range_max);
    const correct =
      (action === "higher" && drawnNumber > currentNumber) ||
      (action === "lower" && drawnNumber < currentNumber) ||
      (action === "same" && drawnNumber === currentNumber);

    if (!correct) {
      currentNumber = drawnNumber;
      await settle("loss", 0, interaction, `❌ The number was **${drawnNumber}** — you lost your bet.`);
      return;
    }

    currentMultiplier = chosenMultiplier;
    roundIndex += 1;
    currentNumber = drawnNumber;

    await interaction.update({ embeds: [buildEmbed()], components: [buildButtons()] }).catch(noop);
  });

  collector.on("end", async () => {
    // `finished` alone disambiguates a genuine timeout from settle()'s own collector.stop() triggering this same
    // "end" event — settle() sets it before stopping the collector, so if it's already true, this run already
    // has a real outcome and this is just that stop() call's echo.
    if (finished) return;

    if (roundIndex === 0) {
      // Never made a guess — refund the bet in full rather than treating inactivity as a loss.
      await settle("push", bet, null, "⌛ Timed out before your first guess. Bet refunded.");
      return;
    }

    // Auto cash-out at the current multiplier rather than losing an already-earned streak to inactivity.
    const payout = potentialPayout(currentMultiplier);
    await settle(
      "win",
      payout,
      null,
      `⌛ Timed out — automatically cashed out at **${currentMultiplier.toFixed(2)}x**.`,
    );
  });
}
