import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { MINUTES, noop } from "../../../utils.js";
import { PvpMatchContext, PvpMatchOutcome } from "./pvpMatch.js";

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

export async function playTicTacToe(ctx: PvpMatchContext): Promise<PvpMatchOutcome> {
  const idBase = `pvpTtt:${ctx.channel.id}:${Date.now()}`;
  const board: Cell[] = new Array(9).fill(null);

  // Randomize who goes first (X) rather than always favoring the challenger
  const [xPlayerId, oPlayerId]: [string, string] =
    Math.random() < 0.5 ? [ctx.challengerId, ctx.opponentId] : [ctx.opponentId, ctx.challengerId];
  const symbolByUser: Record<string, "X" | "O"> = { [xPlayerId]: "X", [oPlayerId]: "O" };
  let currentPlayerId = xPlayerId;

  const checkWinner = (): "X" | "O" | null => {
    for (const [a, b, c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  };

  const buildEmbed = (extra?: string): EmbedBuilder => {
    const rows = [0, 1, 2]
      .map((r) => [0, 1, 2].map((c) => board[r * 3 + c] ?? "・").join(" "))
      .join("\n");
    const turnLine = extra ?? `It's <@${currentPlayerId}>'s turn (${symbolByUser[currentPlayerId]})`;

    return new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${ctx.label} — Tic Tac Toe`)
      .setDescription(`<@${xPlayerId}> (X) vs <@${oPlayerId}> (O)\n\n${rows}\n\n${turnLine}`);
  };

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

  return new Promise<PvpMatchOutcome>((resolve) => {
    let settled = false;

    const collector = sentMessage.createMessageComponentCollector({
      time: MATCH_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(idBase),
    });

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== ctx.challengerId && interaction.user.id !== ctx.opponentId) {
        await interaction.reply({ content: "This isn't your match.", ephemeral: true }).catch(noop);
        return;
      }

      if (interaction.user.id !== currentPlayerId) {
        await interaction.reply({ content: "It's not your turn.", ephemeral: true }).catch(noop);
        return;
      }

      const index = Number(interaction.customId.slice(idBase.length + 1));
      if (board[index] !== null) {
        await interaction.deferUpdate().catch(noop);
        return;
      }

      board[index] = symbolByUser[currentPlayerId];

      const winnerSymbol = checkWinner();
      if (winnerSymbol) {
        const winnerId = winnerSymbol === "X" ? xPlayerId : oPlayerId;
        settled = true;
        collector.stop();
        await interaction
          .update({ embeds: [buildEmbed(`🎉 <@${winnerId}> wins!`)], components: buildButtons(true) })
          .catch(noop);
        resolve({ type: "win", winnerId });
        return;
      }

      if (board.every((cell) => cell !== null)) {
        settled = true;
        collector.stop();
        await interaction
          .update({ embeds: [buildEmbed("It's a draw! Bets refunded.")], components: buildButtons(true) })
          .catch(noop);
        resolve({ type: "push" });
        return;
      }

      currentPlayerId = currentPlayerId === xPlayerId ? oPlayerId : xPlayerId;
      await interaction.update({ embeds: [buildEmbed()], components: buildButtons() }).catch(noop);
    });

    collector.on("end", async () => {
      if (settled) return;
      settled = true;
      await sentMessage
        .edit({ embeds: [buildEmbed("Match timed out. Bets refunded.")], components: buildButtons(true) })
        .catch(noop);
      resolve({ type: "push" });
    });
  });
}
