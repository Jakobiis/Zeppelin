import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  OmitPartialGroupDMChannel,
  TextInputBuilder,
  TextInputStyle,
  User,
  UserSelectMenuBuilder,
} from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { logger } from "../../../logger.js";
import { MINUTES, noop } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { applyCoinsBoost } from "./applyCoinsBoost.js";
import { createShuffledDeck, formatCard, formatCards, handValue, isNaturalBlackjack } from "./blackjackDeck.js";
import {
  BlackjackState,
  activeHand,
  forceStandAll,
  hit,
  isRoundOver,
  playDealer,
  settleHand,
  skipFinishedHands,
  stand,
} from "./blackjackState.js";
import { chargeBalance } from "./chargeBalance.js";
import { checkCooldown } from "./checkCooldown.js";
import { formatAmount } from "./formatAmount.js";
import { logGameHistory } from "./gameHistory.js";
import { isAllOrMaxKeyword, parseAmountInput } from "./parseAmountInput.js";
import { applyGameHold, getSpendableBalance } from "./pendingBalance.js";
import { isPvpDisabled } from "./pvpToggle.js";
import { EconomyPluginType, zEconomyBlackjackGame } from "../types.js";

const MAX_PLAYERS = 10;
const LOBBY_TIMEOUT = 2 * MINUTES;
const TURN_TIMEOUT = 1 * MINUTES;
// In "vs" mode, joiners must bet at least this fraction of the host's bet so nobody can win a big pot off a token bet
const VS_MIN_BET_FRACTION = 0.5;

/**
 * "table": everyone plays their own bet against one shared dealer, like solo blackjack.
 * "vs": no dealer — everyone picks their own bet (at least VS_MIN_BET_FRACTION of the host's), the best hand takes the
 * pot (tied winners split it in proportion to their bets, all bust refunds).
 */
export type BlackjackTableMode = "table" | "vs";

interface Seat {
  userId: string;
  bet: number;
}

export async function runBlackjackTable(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
  gameName: string,
  game: z.infer<typeof zEconomyBlackjackGame>,
  mode: BlackjackTableMode,
  amountArg: string,
  initialInvites: User[] = [],
): Promise<void> {
  const config = pluginData.config.get();
  const hostId = message.author.id;
  const label = game.label ?? gameName;
  const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
  const idBase = `bjTable:${message.id}`;
  const fmt = (amount: number) => `${emojiPrefix}**${formatAmount(amount)}** ${config.currency_name}`;
  const refund = (seat: Seat) => pluginData.state.counters.changeCounterValue(config.counter_name, null, seat.userId, seat.bet);

  // Validates and charges one player's buy-in. Returns the charged bet, or an error message to show them.
  const buyIn = async (userId: string, amountInput: string, minBet = game.min_bet): Promise<number | string> => {
    const cooldownKey = `${gameName}:${userId}`;
    const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
    if (cooldownCheck.onCooldown) return cooldownCheck.message;

    if (mode === "vs" && (await isPvpDisabled(pluginData, userId))) {
      return "You have PvP challenges turned off.";
    }

    const { spendable } = await getSpendableBalance(pluginData, config.counter_name, userId);
    let bet = parseAmountInput(amountInput, spendable);
    if (bet === null) return `Amount must be a positive whole number, or "all"`;
    if (isAllOrMaxKeyword(amountInput)) bet = Math.min(bet, game.max_bet);
    if (bet < minBet || bet > game.max_bet) {
      return `Bet must be between ${minBet} and ${game.max_bet} ${config.currency_name}`;
    }

    if (!(await chargeBalance(pluginData, config.counter_name, userId, bet))) {
      return `You don't have enough ${config.currency_name} for that bet (balance: ${formatAmount(spendable)})`;
    }

    if (cooldownCheck.cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }
    return bet;
  };

  const hostBet = await buyIn(hostId, amountArg);
  if (typeof hostBet === "string") {
    void pluginData.state.common.sendErrorMessage(message, hostBet);
    return;
  }

  let seats: Seat[] = [{ userId: hostId, bet: hostBet }];
  const joining = new Set<string>();
  const minPlayers = mode === "vs" ? 2 : 1;
  const minJoinBet =
    mode === "vs" ? Math.max(game.min_bet, Math.ceil(hostBet * VS_MIN_BET_FRACTION)) : game.min_bet;

  const modeText =
    mode === "vs"
      ? `Players vs each other: join with your own bet of at least ${fmt(minJoinBet)}, and the best hand takes the pot.`
      : "Everyone vs the dealer: each player picks their own bet when joining.";

  const buildLobbyEmbed = (extra?: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${label}: ${mode === "vs" ? "Versus" : "Table"}`)
      .setDescription(
        `${modeText}\n\n**Players (${seats.length}/${MAX_PLAYERS})**\n` +
          seats.map((seat) => `<@${seat.userId}>: ${fmt(seat.bet)}`).join("\n") +
          `\n\n${extra ?? mode === "vs"
            ? `<@${hostId}> can start once ${minPlayers} players have joined. In ${LOBBY_TIMEOUT / MINUTES} minutes it starts automatically if there are enough players, otherwise it closes and bets are refunded.`
            : `<@${hostId}> can start any time. Starts automatically in ${LOBBY_TIMEOUT / MINUTES} minutes.`}`,
      );

  const buildLobbyComponents = () => [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`${idBase}:invite`)
        .setPlaceholder("Host: invite players")
        .setMinValues(1)
        .setMaxValues(MAX_PLAYERS - 1),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel("Start")
        .setCustomId(`${idBase}:start`)
        .setDisabled(seats.length < minPlayers),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Leave").setCustomId(`${idBase}:leave`),
      new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Join").setCustomId(`${idBase}:join`),
    ),
  ];

  const sentMessage = await message.channel.send({ embeds: [buildLobbyEmbed()], components: buildLobbyComponents() });
  const refreshLobby = () =>
    sentMessage.edit({ embeds: [buildLobbyEmbed()], components: buildLobbyComponents() }).catch(noop);

  // Builds the ping for the host's invites, or null if none of them can be invited. Invitees join through the
  // regular Join button, so an invite is just a ping — there's nothing to accept separately.
  const buildInvitePing = async (users: User[]): Promise<string | null> => {
    const invitable: User[] = [];
    for (const user of users) {
      if (user.bot || seats.some((seat) => seat.userId === user.id)) continue;
      if (mode === "vs" && (await isPvpDisabled(pluginData, user.id))) continue;
      invitable.push(user);
    }
    if (!invitable.length) return null;
    return `${invitable.map((user) => `<@${user.id}>`).join(" ")}, <@${hostId}> invited you to **${label}** (${
      mode === "vs" ? `vs each other, min bet ${fmt(minJoinBet)}` : "vs the dealer"
    }). Click **Join** on the table above to play!`;
  };

  if (initialInvites.length) {
    const ping = await buildInvitePing(initialInvites);
    if (ping) await message.channel.send(ping);
  }

  let lobbyClosed = false;
  const started = await new Promise<boolean>((resolve) => {
    const collector = sentMessage.createMessageComponentCollector({
      time: LOBBY_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(`${idBase}:`),
    });

    const close = (start: boolean) => {
      if (lobbyClosed) return;
      lobbyClosed = true;
      collector.stop("closed");
      resolve(start);
    };

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      const userId = interaction.user.id;
      const action = interaction.customId.slice(idBase.length + 1);
      const isSeated = seats.some((seat) => seat.userId === userId);

      if (interaction.isUserSelectMenu()) {
        if (userId !== hostId) {
          await interaction.reply({ content: "Only the host can invite players.", ephemeral: true }).catch(noop);
          return;
        }
        const ping = await buildInvitePing([...interaction.users.values()]);
        if (!ping) {
          await interaction
            .reply({ content: "None of them can be invited (bots, already seated, or PvP turned off).", ephemeral: true })
            .catch(noop);
          return;
        }
        await interaction.reply({ content: ping }).catch(noop);
        await refreshLobby(); // Clears the menu's selection so the host can invite again
        return;
      }

      if (action === "start") {
        if (userId !== hostId) {
          await interaction.reply({ content: "Only the host can start the table.", ephemeral: true }).catch(noop);
          return;
        }
        await interaction.deferUpdate().catch(noop);
        if (seats.length >= minPlayers) close(true);
        return;
      }

      if (action === "leave") {
        if (!isSeated) {
          await interaction.reply({ content: "You're not at this table.", ephemeral: true }).catch(noop);
          return;
        }
        await interaction.deferUpdate().catch(noop);
        if (userId === hostId) {
          close(false);
          return;
        }
        const seat = seats.find((s) => s.userId === userId)!;
        seats = seats.filter((s) => s !== seat);
        await refund(seat);
        await refreshLobby();
        return;
      }

      // Join
      if (isSeated || joining.has(userId)) {
        await interaction.reply({ content: "You're already at this table.", ephemeral: true }).catch(noop);
        return;
      }
      if (seats.length + joining.size >= MAX_PLAYERS) {
        await interaction.reply({ content: "This table is full.", ephemeral: true }).catch(noop);
        return;
      }

      // Unique per click, so a stale bet form from an earlier click can't also pick up this one's submission
      const modalId = `${idBase}:bet:${interaction.id}`;
      await interaction
        .showModal(
          new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`Join ${label}`)
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("amount")
                  .setLabel(`Your bet (${minJoinBet}-${game.max_bet}, or "all")`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        )
        .catch(noop);
      // The player isn't marked as joining while the form is open: a cancelled or closed form never submits, and
      // would otherwise leave them stuck as "already at this table" (and unable to leave) until the lobby ends
      const submit: ModalSubmitInteraction | null = await interaction
        .awaitModalSubmit({ time: LOBBY_TIMEOUT, filter: (s) => s.customId === modalId })
        .catch(() => null);
      if (!submit) return;

      // Acknowledge right away: the buy-in below hits the database and can outlast Discord's 3-second window,
      // which shows the player "Something went wrong" on the form
      await submit.deferReply({ ephemeral: true }).catch(noop);
      const respond = (content: string) => submit.editReply({ content }).catch(noop);

      if (lobbyClosed) {
        await respond("This table has already started.");
        return;
      }
      // Re-checked now that the form is in, since others may have joined (or this player, via another form) meanwhile
      if (seats.some((seat) => seat.userId === userId) || joining.has(userId)) {
        await respond("You're already at this table.");
        return;
      }
      if (seats.length + joining.size >= MAX_PLAYERS) {
        await respond("This table is full.");
        return;
      }

      joining.add(userId);
      try {
        const amountInput = submit.fields.getTextInputValue("amount");
        const result = await buyIn(userId, amountInput, minJoinBet);
        if (typeof result === "string") {
          await respond(result);
          return;
        }

        // The host can start the table while a buy-in is still being charged
        if (lobbyClosed) {
          await refund({ userId, bet: result });
          await respond("This table has already started.");
          return;
        }

        seats.push({ userId, bet: result });
        await refreshLobby();
        await respond(`You joined with ${fmt(result)}.`);
      } catch (err) {
        // Collector handlers have no one awaiting them, so an uncaught error here would just vanish
        logger.error(err, "Blackjack table join failed");
        await respond("Something went wrong joining the table. Please try again.");
      } finally {
        joining.delete(userId);
      }
    });

    collector.on("end", () => close(seats.length >= minPlayers));
  });

  if (!started) {
    for (const seat of seats) await refund(seat);
    await sentMessage
      .edit({ embeds: [buildLobbyEmbed("Table closed. All bets refunded.")], components: [] })
      .catch(noop);
    return;
  }

  // Random turn order in "vs" mode, since acting later (seeing everyone else's hand first) is an advantage
  if (mode === "vs") {
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
  }

  // Two decks, so 10 players plus the dealer can't run the shoe dry
  const deck = createShuffledDeck(2);
  const state: BlackjackState = {
    deck,
    dealerHand: mode === "table" ? [deck.pop()!, deck.pop()!] : [],
    hands: seats.map((seat) => {
      const cards = [deck.pop()!, deck.pop()!];
      return {
        cards,
        bet: seat.bet,
        doubled: false,
        isSplitAces: false,
        status: isNaturalBlackjack(cards) ? "stood" : "playing",
      };
    }),
    activeHandIndex: 0,
  };

  // A dealer natural ends the round before anyone acts, same as solo blackjack
  const dealerNatural = mode === "table" && isNaturalBlackjack(state.dealerHand);
  if (dealerNatural) {
    forceStandAll(state);
  } else {
    skipFinishedHands(state);
  }

  const buildPlayEmbed = (results?: string[]): EmbedBuilder => {
    const revealDealer = results != null;
    const dealerLine =
      mode === "table"
        ? `**Dealer**: ${
            revealDealer
              ? `${formatCards(state.dealerHand)} (${handValue(state.dealerHand).total})`
              : `${formatCard(state.dealerHand[0])} 🂠`
          }\n\n`
        : `**Pot**: ${fmt(seats.reduce((sum, seat) => sum + seat.bet, 0))}\n\n`;

    const handLines = state.hands.map((hand, i) => {
      const marker = !revealDealer && i === state.activeHandIndex ? "▶️ " : "";
      const natural = isNaturalBlackjack(hand.cards) ? " (Blackjack!)" : "";
      const statusText = results
        ? `: ${results[i]}`
        : hand.status === "bust"
          ? " (Bust)"
          : hand.status === "stood"
            ? natural || " (Stand)"
            : "";
      return `${marker}<@${seats[i].userId}> (${formatAmount(hand.bet)}): ${formatCards(hand.cards)} (${handValue(hand.cards).total})${statusText}`;
    });

    const turnLine = results ? "" : `\n\nIt's <@${seats[state.activeHandIndex].userId}>'s turn.`;
    return new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(label)
      .setDescription(`${dealerLine}${handLines.join("\n")}${turnLine}`);
  };

  const playButtons = (): ActionRowBuilder<ButtonBuilder> =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("Hit").setCustomId(`${idBase}:play:hit`),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Stand").setCustomId(`${idBase}:play:stand`),
    );

  const payouts = (): number[] => {
    if (mode === "table") {
      if (!dealerNatural) playDealer(state);
      const dealerTotal = handValue(state.dealerHand).total;
      return state.hands.map((hand) => {
        const natural = isNaturalBlackjack(hand.cards);
        if (dealerNatural) return natural ? hand.bet : 0;
        if (natural) return hand.bet + Math.floor(hand.bet * game.blackjack_payout);
        return settleHand(hand, dealerTotal).payout;
      });
    }

    // A natural beats a drawn 21
    const scores = state.hands.map((hand) =>
      hand.status === "bust" ? -1 : handValue(hand.cards).total + (isNaturalBlackjack(hand.cards) ? 0.5 : 0),
    );
    const best = Math.max(...scores);
    if (best < 0) return state.hands.map((hand) => hand.bet);

    // Tied winners split the pot in proportion to their bets; rounding leftovers go to the first winner
    const pot = state.hands.reduce((sum, hand) => sum + hand.bet, 0);
    const winners = scores.flatMap((score, i) => (score === best ? [i] : []));
    const winnersBet = winners.reduce((sum, i) => sum + state.hands[i].bet, 0);
    const shares = state.hands.map((hand, i) =>
      winners.includes(i) ? Math.floor((pot * hand.bet) / winnersBet) : 0,
    );
    shares[winners[0]] += pot - shares.reduce((sum, share) => sum + share, 0);
    return shares;
  };

  await sentMessage.edit({ embeds: [buildPlayEmbed()], components: [playButtons()] }).catch(noop);

  await new Promise<void>((resolve) => {
    let finished = false;
    let turnTimer: NodeJS.Timeout | undefined;

    const collector = sentMessage.createMessageComponentCollector({
      // Hard cap in case something goes wrong; normal play ends via finish()
      time: (seats.length + 1) * TURN_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(`${idBase}:play:`),
    });

    const finish = async (interaction: MessageComponentInteraction | null): Promise<void> => {
      if (finished) return;
      finished = true;
      clearTimeout(turnTimer);
      collector.stop("finished");
      forceStandAll(state);

      const results: string[] = [];
      const rawPayouts = payouts();
      for (const [i, seat] of seats.entries()) {
        let payout = rawPayouts[i];
        const lock = await pluginData.locks.acquire(economyUserLock({ id: seat.userId }));
        try {
          // Dealer winnings are house money, so they get the shop coins boost like solo blackjack; a "vs" pot is
          // other players' money, so it doesn't (same as other PvP games).
          if (mode === "table" && payout > seat.bet) {
            payout = seat.bet + (await applyCoinsBoost(pluginData, seat.userId, payout - seat.bet));
          }
          if (payout > 0) {
            await pluginData.state.counters.changeCounterValue(config.counter_name, null, seat.userId, payout);
          }
          await applyGameHold(pluginData, seat.userId, payout - seat.bet, game.hold);
        } finally {
          lock.unlock();
        }

        const net = payout - seat.bet;
        const outcome = net > 0 ? "win" : net === 0 ? "push" : "loss";
        results.push(net > 0 ? `Won +${fmt(net)}` : net === 0 ? "Push" : `Lost ${fmt(seat.bet)}`);

        await logGameHistory(pluginData, {
          userId: seat.userId,
          gameName,
          gameType: mode === "vs" ? "pvp" : "blackjack",
          outcome,
          betAmount: seat.bet,
          amountChanged: net,
          balanceAfter: await pluginData.state.counters.getCounterValue(config.counter_name, null, seat.userId),
        });
      }

      const payload = { embeds: [buildPlayEmbed(results)], components: [] };
      if (interaction) {
        await interaction.update(payload).catch(noop);
      } else {
        await sentMessage.edit(payload).catch(noop);
      }
      resolve();
    };

    // An AFK player auto-stands after TURN_TIMEOUT so they can't hold up the rest of the table
    const armTurnTimer = () => {
      clearTimeout(turnTimer);
      turnTimer = setTimeout(() => void act(null, "stand"), TURN_TIMEOUT);
    };

    const act = async (interaction: MessageComponentInteraction | null, action: string): Promise<void> => {
      if (finished) return;
      if (action === "hit") hit(state);
      else stand(state);

      if (isRoundOver(state)) {
        await finish(interaction);
        return;
      }

      armTurnTimer();
      const payload = { embeds: [buildPlayEmbed()], components: [playButtons()] };
      if (interaction) {
        await interaction.update(payload).catch(noop);
      } else {
        await sentMessage.edit(payload).catch(noop);
      }
    };

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      const hand = activeHand(state);
      if (!hand || finished || seats[state.activeHandIndex].userId !== interaction.user.id) {
        await interaction.reply({ content: "It's not your turn.", ephemeral: true }).catch(noop);
        return;
      }
      await act(interaction, interaction.customId.slice(`${idBase}:play:`.length));
    });

    collector.on("end", () => void finish(null));

    if (isRoundOver(state)) {
      void finish(null);
    } else {
      armTurnTimer();
    }
  });
}
