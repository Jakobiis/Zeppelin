import { EmbedBuilder } from "discord.js";
import { PvpBotMatchContext, PvpBotMatchOutcome } from "./pvpBotMatch.js";

function rollTwoDice(): number {
  return 1 + Math.floor(Math.random() * 6) + (1 + Math.floor(Math.random() * 6));
}

export async function playDiceDuelVsBot(ctx: PvpBotMatchContext): Promise<PvpBotMatchOutcome> {
  const playerRoll = rollTwoDice();
  const botRoll = rollTwoDice();

  let resultText: string;
  let outcome: PvpBotMatchOutcome;

  if (playerRoll === botRoll) {
    resultText = "It's a tie! Bet refunded.";
    outcome = { type: "push" };
  } else if (playerRoll > botRoll) {
    resultText = `<@${ctx.playerId}> wins!`;
    outcome = { type: "win" };
  } else {
    resultText = "🤖 The Bot wins!";
    outcome = { type: "loss" };
  }

  const embed = new EmbedBuilder()
    .setColor(0x0159b2)
    .setTitle(`${ctx.label} — Dice Duel vs Bot`)
    .setDescription(
      `<@${ctx.playerId}> rolled 🎲 **${playerRoll}**\n🤖 Bot rolled 🎲 **${botRoll}**\n\n${resultText}`,
    );

  await ctx.channel.send({ embeds: [embed] });
  return outcome;
}
