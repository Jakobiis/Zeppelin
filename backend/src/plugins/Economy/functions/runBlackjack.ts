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
import { formatCard, formatCards, handValue } from "./blackjackDeck.js";
import {
  BlackjackHand,
  HandOutcome,
  activeHand,
  canDouble,
  canSplit,
  checkInitialBlackjack,
  dealInitialState,
  doubleDown,
  forceStandAll,
  hit,
  isRoundOver,
  playDealer,
  settleHand,
  split,
  stand,
} from "./blackjackState.js";
import { checkCooldown } from "./checkCooldown.js";
import { parseAmountInput } from "./parseAmountInput.js";
import { EconomyPluginType, zEconomyBlackjackGame } from "../types.js";

const ROUND_TIMEOUT = 3 * MINUTES;

export async function runBlackjack(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  gameName: string,
  game: z.infer<typeof zEconomyBlackjackGame>,
  amountArg: string,
): Promise<void> {
  const config = pluginData.config.get();
  const userId = message.author.id;
  const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
  const label = game.label ?? gameName;
  const idBase = `blackjack:${message.id}`;

  const cooldownKey = `${gameName}:${userId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    void pluginData.state.common.sendErrorMessage(message, cooldownCheck.message);
    return;
  }

  const estimateBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

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

  // Charges (or refuses) an additional amount from the player's balance — used for the initial bet as well as
  // for doubling down/splitting, each locked independently rather than holding one lock for the whole hand
  // (which could span minutes of button interaction).
  const chargeBet = async (amount: number): Promise<boolean> => {
    const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
    try {
      const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
      if (balance < amount) {
        return false;
      }
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, -amount);
      return true;
    } finally {
      lock.unlock();
    }
  };

  const charged = await chargeBet(bet);
  if (!charged) {
    void pluginData.state.common.sendErrorMessage(
      message,
      `You don't have enough ${config.currency_name} for that bet (balance: ${estimateBalance})`,
    );
    return;
  }

  if (cooldownCheck.cooldownMs) {
    pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
  }

  const state = dealInitialState(bet);

  const handResultText = (outcome: HandOutcome, hand: BlackjackHand): string => {
    if (outcome === "win") return `Won +${emojiPrefix}${hand.bet}`;
    if (outcome === "push") return "Push";
    return "Lost";
  };

  const buildDescription = (opts: { revealDealer: boolean; results?: Array<{ outcome: HandOutcome }> }): string => {
    const dealerTotal = handValue(state.dealerHand).total;
    const dealerText = opts.revealDealer
      ? `${formatCards(state.dealerHand)} (${dealerTotal})`
      : `${formatCard(state.dealerHand[0])} 🂠`;

    const multiHand = state.hands.length > 1;
    const handLines = state.hands.map((hand, i) => {
      const total = handValue(hand.cards).total;
      const isActive = !opts.revealDealer && i === state.activeHandIndex;
      const marker = isActive ? "▶️ " : "";
      const handLabel = multiHand ? `Hand ${i + 1}` : "Your Hand";
      const doubledText = hand.doubled ? " (Doubled)" : "";

      let statusText = "";
      if (opts.results) {
        statusText = ` — ${handResultText(opts.results[i].outcome, hand)}`;
      } else if (hand.status === "bust") {
        statusText = " — Bust";
      } else if (hand.status === "stood") {
        statusText = " — Stand";
      }

      return `${marker}**${handLabel}**: ${formatCards(hand.cards)} (${total})${doubledText}${statusText}`;
    });

    return `**Dealer**: ${dealerText}\n\n${handLines.join("\n")}`;
  };

  const buildEmbed = (description: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${label} — ${config.currency_name} Blackjack`)
      .setDescription(description);

  const buildButtons = (): ActionRowBuilder<ButtonBuilder> =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("Hit").setCustomId(`${idBase}:hit`),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Stand").setCustomId(`${idBase}:stand`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setLabel("Double")
        .setCustomId(`${idBase}:double`)
        .setDisabled(!canDouble(state)),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setLabel("Split")
        .setCustomId(`${idBase}:split`)
        .setDisabled(!canSplit(state)),
    );

  // A natural blackjack (either side) resolves immediately, before any buttons are ever shown.
  const initialOutcome = checkInitialBlackjack(state);
  if (initialOutcome) {
    let payout = 0;
    let resultText: string;

    if (initialOutcome === "push_blackjack") {
      payout = bet;
      resultText = "Both you and the dealer got Blackjack — push!";
    } else if (initialOutcome === "player_blackjack") {
      payout = bet + Math.floor(bet * game.blackjack_payout);
      resultText = `Blackjack! You win ${emojiPrefix}**${payout - bet}** ${config.currency_name}!`;
    } else {
      resultText = "Dealer has Blackjack — you lose.";
    }

    if (payout > 0) {
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, payout);
    }

    const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
    const description = `${buildDescription({ revealDealer: true })}\n\n${resultText}\nNew balance: ${emojiPrefix}**${newBalance}** ${config.currency_name}`;

    await message.channel.send({ embeds: [buildEmbed(description)] });
    return;
  }

  const sentMessage = await message.channel.send({
    embeds: [buildEmbed(buildDescription({ revealDealer: false }))],
    components: [buildButtons()],
  });

  let finished = false;

  const finishRound = async (interaction: MessageComponentInteraction | null): Promise<void> => {
    if (finished) return;
    finished = true;

    forceStandAll(state);
    playDealer(state);
    const dealerTotal = handValue(state.dealerHand).total;

    const results: Array<{ outcome: HandOutcome; payout: number }> = [];
    for (const hand of state.hands) {
      const result = settleHand(hand, dealerTotal);
      if (result.payout > 0) {
        await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, result.payout);
      }
      results.push(result);
    }

    const totalBet = state.hands.reduce((sum, hand) => sum + hand.bet, 0);
    const totalPayout = results.reduce((sum, r) => sum + r.payout, 0);
    const net = totalPayout - totalBet;
    const netText = net > 0 ? `+${emojiPrefix}${net}` : net < 0 ? `-${emojiPrefix}${Math.abs(net)}` : "no change";

    const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
    const description = `${buildDescription({ revealDealer: true, results })}\n\nNet: **${netText}** ${config.currency_name}\nNew balance: ${emojiPrefix}**${newBalance}** ${config.currency_name}`;
    const embed = buildEmbed(description);

    if (interaction) {
      await interaction.update({ embeds: [embed], components: [] }).catch(noop);
    } else {
      await sentMessage.edit({ embeds: [embed], components: [] }).catch(noop);
    }
  };

  const collector = sentMessage.createMessageComponentCollector({
    time: ROUND_TIMEOUT,
    filter: (interaction) => interaction.customId.startsWith(idBase),
  });

  collector.on("collect", async (interaction: MessageComponentInteraction) => {
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: "You are not permitted to use these buttons.", ephemeral: true }).catch(noop);
      return;
    }

    const action = interaction.customId.slice(idBase.length + 1);

    if (action === "hit") {
      hit(state);
    } else if (action === "stand") {
      stand(state);
    } else if (action === "double") {
      if (!canDouble(state)) {
        await interaction.deferUpdate().catch(noop);
        return;
      }
      const hand = activeHand(state)!;
      const ok = await chargeBet(hand.bet);
      if (!ok) {
        await interaction
          .reply({ content: `You don't have enough ${config.currency_name} to double down.`, ephemeral: true })
          .catch(noop);
        return;
      }
      doubleDown(state);
    } else if (action === "split") {
      if (!canSplit(state)) {
        await interaction.deferUpdate().catch(noop);
        return;
      }
      const hand = activeHand(state)!;
      const ok = await chargeBet(hand.bet);
      if (!ok) {
        await interaction
          .reply({ content: `You don't have enough ${config.currency_name} to split.`, ephemeral: true })
          .catch(noop);
        return;
      }
      split(state);
    }

    if (isRoundOver(state)) {
      collector.stop();
      await finishRound(interaction);
    } else {
      await interaction
        .update({ embeds: [buildEmbed(buildDescription({ revealDealer: false }))], components: [buildButtons()] })
        .catch(noop);
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "stopped") return;
    await finishRound(null);
  });
}
