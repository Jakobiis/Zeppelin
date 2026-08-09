import { EmbedBuilder } from "discord.js";
import { PvpMatchContext, PvpMatchOutcome } from "./pvpMatch.js";

function rollTwoDice(): number {
  return 1 + Math.floor(Math.random() * 6) + (1 + Math.floor(Math.random() * 6));
}

export async function playDiceDuel(ctx: PvpMatchContext): Promise<PvpMatchOutcome> {
  const challengerRoll = rollTwoDice();
  const opponentRoll = rollTwoDice();

  let resultText: string;
  let outcome: PvpMatchOutcome;

  if (challengerRoll === opponentRoll) {
    resultText = "It's a tie! Bets refunded.";
    outcome = { type: "push" };
  } else if (challengerRoll > opponentRoll) {
    resultText = `<@${ctx.challengerId}> wins!`;
    outcome = { type: "win", winnerId: ctx.challengerId };
  } else {
    resultText = `<@${ctx.opponentId}> wins!`;
    outcome = { type: "win", winnerId: ctx.opponentId };
  }

  const embed = new EmbedBuilder()
    .setColor(0x0159b2)
    .setTitle(`${ctx.label} — Dice Duel`)
    .setDescription(
      `<@${ctx.challengerId}> rolled 🎲 **${challengerRoll}**\n<@${ctx.opponentId}> rolled 🎲 **${opponentRoll}**\n\n${resultText}`,
    );

  await ctx.channel.send({ embeds: [embed] });
  return outcome;
}
