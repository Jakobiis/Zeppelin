import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { MINUTES, noop } from "../../../utils.js";
import { PvpBotMatchContext, PvpBotMatchOutcome } from "./pvpBotMatch.js";

const MATCH_TIMEOUT = 5 * MINUTES;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

type Cell = "X" | "O" | null;

// Chance the bot skips its win/block check on a given move and just plays positionally instead — without this,
// the heuristic below never misses a win or a block, so a player could at best force a draw and never actually win.
const MISTAKE_CHANCE = 0.08;

function checkWinner(board: Cell[]): "X" | "O" | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function emptyCells(board: Cell[]): number[] {
  const empty: number[] = [];
  board.forEach((cell, i) => {
    if (cell === null) empty.push(i);
  });
  return empty;
}

/**
 * Full minimax over the (tiny, 9-cell) game tree — the previous version only checked one move ahead for an
 * immediate win/block, which a player can reliably beat with a fork (two simultaneous threats it can't see
 * coming, since it only ever blocks one at a time). Minimax can't be forked: from any reachable position it
 * always picks the move that's least bad in the worst case, so a human can at best force a draw against it.
 */
function minimax(
  board: Cell[],
  turnSymbol: "X" | "O",
  botSymbol: "X" | "O",
  humanSymbol: "X" | "O",
  depth: number,
): { score: number; move: number | null } {
  const winner = checkWinner(board);
  if (winner === botSymbol) return { score: 10 - depth, move: null };
  if (winner === humanSymbol) return { score: depth - 10, move: null };

  const empty = emptyCells(board);
  if (empty.length === 0) return { score: 0, move: null };

  const maximizing = turnSymbol === botSymbol;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMove = empty[0];

  for (const i of empty) {
    const copy = [...board];
    copy[i] = turnSymbol;
    const { score } = minimax(copy, turnSymbol === "X" ? "O" : "X", botSymbol, humanSymbol, depth + 1);

    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  return { score: bestScore, move: bestMove };
}

/** Plays perfectly (via minimax) unless it rolls a deliberate mistake (see MISTAKE_CHANCE), in which case it
 * falls back to a simple, non-lookahead positional pick so the player gets a genuine, if infrequent, shot at
 * winning instead of the bot being flat-out unbeatable. */
function pickBotMove(board: Cell[], botSymbol: "X" | "O", humanSymbol: "X" | "O"): number {
  const empty = emptyCells(board);

  if (Math.random() >= MISTAKE_CHANCE) {
    return minimax(board, botSymbol, botSymbol, humanSymbol, 0).move ?? empty[0];
  }

  if (empty.includes(4)) return 4;

  const corners = [0, 2, 6, 8].filter((i) => empty.includes(i));
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

  return empty[Math.floor(Math.random() * empty.length)];
}

export async function playTicTacToeVsBot(ctx: PvpBotMatchContext): Promise<PvpBotMatchOutcome> {
  const idBase = `pvpBotTtt:${ctx.channel.id}:${Date.now()}`;
  const board: Cell[] = new Array(9).fill(null);

  const humanGoesFirst = Math.random() < 0.5;
  const humanSymbol: "X" | "O" = humanGoesFirst ? "X" : "O";
  const botSymbol: "X" | "O" = humanGoesFirst ? "O" : "X";
  let isHumanTurn = humanGoesFirst;

  // If the bot goes first, let it move before the board is ever shown
  if (!isHumanTurn) {
    board[pickBotMove(board, botSymbol, humanSymbol)] = botSymbol;
    isHumanTurn = true;
  }

  const buildDescription = (extra?: string): string => {
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => board[r * 3 + c] ?? "・").join(" ")).join("\n");
    const turnLine =
      extra ?? `It's ${isHumanTurn ? `<@${ctx.playerId}>'s` : "🤖 Bot's"} turn (${isHumanTurn ? humanSymbol : botSymbol})`;
    return `<@${ctx.playerId}> (${humanSymbol}) vs 🤖 Bot (${botSymbol})\n\n${rows}\n\n${turnLine}`;
  };

  const buildEmbed = (extra?: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setAuthor({ name: ctx.player.username, iconURL: ctx.player.displayAvatarURL() })
      .setTitle(`${ctx.label} — Tic Tac Toe vs Bot`)
      .setDescription(buildDescription(extra));

  const buildButtons = (disabled = false): ActionRowBuilder<ButtonBuilder>[] => {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let r = 0; r < 3; r++) {
      const buttons: ButtonBuilder[] = [];
      for (let c = 0; c < 3; c++) {
        const i = r * 3 + c;
        const value = board[i];
        buttons.push(
          new ButtonBuilder()
            .setStyle(value === "X" ? ButtonStyle.Danger : value === "O" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setLabel(value ?? "​")
            .setCustomId(`${idBase}:${i}`)
            .setDisabled(disabled || value !== null),
        );
      }
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
    }
    return rows;
  };

  const sentMessage = await ctx.channel.send({ embeds: [buildEmbed()], components: buildButtons() });

  return new Promise<PvpBotMatchOutcome>((resolve) => {
    let settled = false;

    const collector = sentMessage.createMessageComponentCollector({
      time: MATCH_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(idBase),
    });

    // When ending as a direct result of a button click, we must acknowledge that click itself (via
    // interaction.update) rather than editing the message through a separate REST call — otherwise Discord shows
    // the clicking user "This interaction failed"/"didn't respond in time" even though the board did update.
    // The timeout path (collector "end") has no interaction to acknowledge, so it falls back to a plain edit.
    const endWith = async (
      outcome: PvpBotMatchOutcome,
      extra: string,
      interaction?: MessageComponentInteraction,
    ): Promise<void> => {
      settled = true;
      collector.stop();
      const payload = { embeds: [buildEmbed(extra)], components: buildButtons(true) };
      if (interaction) {
        await interaction.update(payload).catch(noop);
      } else {
        await sentMessage.edit(payload).catch(noop);
      }
      resolve(outcome);
    };

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== ctx.playerId) {
        await interaction.reply({ content: "This isn't your match.", ephemeral: true }).catch(noop);
        return;
      }

      if (!isHumanTurn) {
        await interaction.reply({ content: "It's not your turn.", ephemeral: true }).catch(noop);
        return;
      }

      const index = Number(interaction.customId.slice(idBase.length + 1));
      if (board[index] !== null) {
        await interaction.deferUpdate().catch(noop);
        return;
      }

      board[index] = humanSymbol;

      if (checkWinner(board)) {
        await endWith({ type: "win" }, `🎉 <@${ctx.playerId}> wins!`, interaction);
        return;
      }
      if (board.every((cell) => cell !== null)) {
        await endWith({ type: "push" }, "It's a draw! Bet refunded.", interaction);
        return;
      }

      // Bot's turn, resolved immediately (no separate interaction) so both moves land in one update
      isHumanTurn = false;
      board[pickBotMove(board, botSymbol, humanSymbol)] = botSymbol;

      if (checkWinner(board)) {
        await endWith({ type: "loss" }, "🤖 The Bot wins!", interaction);
        return;
      }
      if (board.every((cell) => cell !== null)) {
        await endWith({ type: "push" }, "It's a draw! Bet refunded.", interaction);
        return;
      }

      isHumanTurn = true;
      await interaction.update({ embeds: [buildEmbed()], components: buildButtons() }).catch(noop);
    });

    collector.on("end", async () => {
      if (settled) return;
      settled = true;
      await sentMessage
        .edit({ embeds: [buildEmbed("Match timed out. Bet refunded.")], components: buildButtons(true) })
        .catch(noop);
      resolve({ type: "push" });
    });
  });
}
