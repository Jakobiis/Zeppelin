import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { MINUTES, noop } from "../../../utils.js";
import { PvpMatchContext, PvpMatchOutcome } from "./pvpMatch.js";

const CHOICE_TIMEOUT = 2 * MINUTES;

type Choice = "rock" | "paper" | "scissors";

const BEATS: Record<Choice, Choice> = { rock: "scissors", paper: "rock", scissors: "paper" };
const CHOICE_EMOJI: Record<Choice, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const CHOICE_LABEL: Record<Choice, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

export async function playRockPaperScissors(ctx: PvpMatchContext): Promise<PvpMatchOutcome> {
  const idBase = `pvpRps:${ctx.channel.id}:${Date.now()}`;
  const choices = new Map<string, Choice>();

  const statusLine = (userId: string): string =>
    choices.has(userId) ? "✅ Chosen" : "⏳ Waiting...";

  const buildEmbed = (extra?: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${ctx.label} — Rock Paper Scissors`)
      .setDescription(
        `<@${ctx.challengerId}> vs <@${ctx.opponentId}>\n\n` +
          `<@${ctx.challengerId}>: ${statusLine(ctx.challengerId)}\n` +
          `<@${ctx.opponentId}>: ${statusLine(ctx.opponentId)}` +
          (extra ? `\n\n${extra}` : ""),
      );

  const buildButtons = (disabled = false): ActionRowBuilder<ButtonBuilder> =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      (["rock", "paper", "scissors"] as Choice[]).map((choice) =>
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(CHOICE_EMOJI[choice])
          .setLabel(CHOICE_LABEL[choice])
          .setCustomId(`${idBase}:${choice}`)
          .setDisabled(disabled),
      ),
    );

  const sentMessage = await ctx.channel.send({ embeds: [buildEmbed()], components: [buildButtons()] });

  return new Promise<PvpMatchOutcome>((resolve) => {
    let settled = false;

    const collector = sentMessage.createMessageComponentCollector({
      time: CHOICE_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(idBase),
    });

    const finish = async (outcome: PvpMatchOutcome, extra: string): Promise<void> => {
      if (settled) return;
      settled = true;
      collector.stop();
      await sentMessage.edit({ embeds: [buildEmbed(extra)], components: [buildButtons(true)] }).catch(noop);
      resolve(outcome);
    };

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== ctx.challengerId && interaction.user.id !== ctx.opponentId) {
        await interaction.reply({ content: "This isn't your match.", ephemeral: true }).catch(noop);
        return;
      }

      if (choices.has(interaction.user.id)) {
        await interaction.reply({ content: "You already chose.", ephemeral: true }).catch(noop);
        return;
      }

      const choice = interaction.customId.slice(idBase.length + 1) as Choice;
      choices.set(interaction.user.id, choice);
      await interaction
        .reply({ content: `You chose ${CHOICE_EMOJI[choice]} ${CHOICE_LABEL[choice]}.`, ephemeral: true })
        .catch(noop);

      if (choices.size < 2) {
        await sentMessage.edit({ embeds: [buildEmbed()] }).catch(noop);
        return;
      }

      const challengerChoice = choices.get(ctx.challengerId)!;
      const opponentChoice = choices.get(ctx.opponentId)!;
      const revealLine =
        `<@${ctx.challengerId}> chose ${CHOICE_EMOJI[challengerChoice]} ${CHOICE_LABEL[challengerChoice]}\n` +
        `<@${ctx.opponentId}> chose ${CHOICE_EMOJI[opponentChoice]} ${CHOICE_LABEL[opponentChoice]}`;

      if (challengerChoice === opponentChoice) {
        await finish({ type: "push" }, `${revealLine}\n\nIt's a tie! Bets refunded.`);
      } else if (BEATS[challengerChoice] === opponentChoice) {
        await finish({ type: "win", winnerId: ctx.challengerId }, `${revealLine}\n\n<@${ctx.challengerId}> wins!`);
      } else {
        await finish({ type: "win", winnerId: ctx.opponentId }, `${revealLine}\n\n<@${ctx.opponentId}> wins!`);
      }
    });

    collector.on("end", async () => {
      if (settled) return;
      settled = true;
      await sentMessage
        .edit({
          embeds: [buildEmbed("Match timed out without both players choosing. Bets refunded.")],
          components: [buildButtons(true)],
        })
        .catch(noop);
      resolve({ type: "push" });
    });
  });
}
