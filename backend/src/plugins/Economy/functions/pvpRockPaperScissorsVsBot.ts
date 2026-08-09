import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction } from "discord.js";
import { MINUTES, noop } from "../../../utils.js";
import { PvpBotMatchContext, PvpBotMatchOutcome } from "./pvpBotMatch.js";

const CHOICE_TIMEOUT = 2 * MINUTES;

type Choice = "rock" | "paper" | "scissors";
const CHOICES: Choice[] = ["rock", "paper", "scissors"];

const BEATS: Record<Choice, Choice> = { rock: "scissors", paper: "rock", scissors: "paper" };
const CHOICE_EMOJI: Record<Choice, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const CHOICE_LABEL: Record<Choice, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

export async function playRockPaperScissorsVsBot(ctx: PvpBotMatchContext): Promise<PvpBotMatchOutcome> {
  const idBase = `pvpBotRps:${ctx.channel.id}:${Date.now()}`;

  const buildEmbed = (description: string): EmbedBuilder =>
    new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle(`${ctx.label} — Rock Paper Scissors vs Bot`)
      .setDescription(description);

  const buildButtons = (disabled = false): ActionRowBuilder<ButtonBuilder> =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      CHOICES.map((choice) =>
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(CHOICE_EMOJI[choice])
          .setLabel(CHOICE_LABEL[choice])
          .setCustomId(`${idBase}:${choice}`)
          .setDisabled(disabled),
      ),
    );

  const sentMessage = await ctx.channel.send({
    embeds: [buildEmbed(`<@${ctx.playerId}>, choose your move!`)],
    components: [buildButtons()],
  });

  return new Promise<PvpBotMatchOutcome>((resolve) => {
    let settled = false;

    const collector = sentMessage.createMessageComponentCollector({
      time: CHOICE_TIMEOUT,
      filter: (interaction) => interaction.customId.startsWith(idBase),
    });

    collector.on("collect", async (interaction: MessageComponentInteraction) => {
      if (interaction.user.id !== ctx.playerId) {
        await interaction.reply({ content: "This isn't your match.", ephemeral: true }).catch(noop);
        return;
      }

      if (settled) return;
      settled = true;
      collector.stop();

      const playerChoice = interaction.customId.slice(idBase.length + 1) as Choice;
      const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];

      const revealLine =
        `<@${ctx.playerId}> chose ${CHOICE_EMOJI[playerChoice]} ${CHOICE_LABEL[playerChoice]}\n` +
        `🤖 Bot chose ${CHOICE_EMOJI[botChoice]} ${CHOICE_LABEL[botChoice]}`;

      let outcome: PvpBotMatchOutcome;
      let resultText: string;
      if (playerChoice === botChoice) {
        outcome = { type: "push" };
        resultText = "It's a tie! Bet refunded.";
      } else if (BEATS[playerChoice] === botChoice) {
        outcome = { type: "win" };
        resultText = `<@${ctx.playerId}> wins!`;
      } else {
        outcome = { type: "loss" };
        resultText = "🤖 The Bot wins!";
      }

      await interaction
        .update({ embeds: [buildEmbed(`${revealLine}\n\n${resultText}`)], components: [buildButtons(true)] })
        .catch(noop);
      resolve(outcome);
    });

    collector.on("end", async () => {
      if (settled) return;
      settled = true;
      await sentMessage
        .edit({ embeds: [buildEmbed("You didn't choose in time. Bet refunded.")], components: [buildButtons(true)] })
        .catch(noop);
      resolve({ type: "push" });
    });
  });
}
