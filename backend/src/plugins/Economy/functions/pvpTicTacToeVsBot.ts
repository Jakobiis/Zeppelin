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

function checkWinner(board: Cell[]): "X" | "O" | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

/** Simple heuristic, not a full minimax: take a winning move if there is one, block the human's winning move if
 * there is one, otherwise prefer the center, then a corner, then whatever's left. */
function pickBotMove(board: Cell[], botSymbol: "X" | "O", humanSymbol: "X" | "O"): number {
  const empty: number[] = [];
  board.forEach((cell, i) => {
    if (cell === null) empty.push(i);
  });

  for (const i of empty) {
    const copy = [...board];
    copy[i] = botSymbol;
    if (checkWinner(copy) === botSymbol) return i;
  }

  for (const i of empty) {
    const copy = [...board];
    copy[i] = humanSymbol;
    if (checkWinner(copy) === humanSymbol) return i;
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

    const endWith = async (outcome: PvpBotMatchOutcome, extra: string): Promise<void> => {
      settled = true;
      collector.stop();
      await sentMessage.edit({ embeds: [buildEmbed(extra)], components: buildButtons(true) }).catch(noop);
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
        await endWith({ type: "win" }, `🎉 <@${ctx.playerId}> wins!`);
        return;
      }
      if (board.every((cell) => cell !== null)) {
        await endWith({ type: "push" }, "It's a draw! Bet refunded.");
        return;
      }

      // Bot's turn, resolved immediately (no separate interaction) so both moves land in one update
      isHumanTurn = false;
      board[pickBotMove(board, botSymbol, humanSymbol)] = botSymbol;

      if (checkWinner(board)) {
        await endWith({ type: "loss" }, "🤖 The Bot wins!");
        return;
      }
      if (board.every((cell) => cell !== null)) {
        await endWith({ type: "push" }, "It's a draw! Bet refunded.");
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
