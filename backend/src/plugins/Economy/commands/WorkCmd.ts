import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { claimReward } from "../functions/claimReward.js";
import { EconomyPluginType } from "../types.js";

// The reward-type game the `work` command claims from — configure it under this exact key in `economy.games`.
const WORK_GAME_NAME = "work";

export const WorkCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["work"],
  permission: "can_play",

  signature: {},

  async run({ pluginData, message }) {
    const config = pluginData.config.get();
    const game = config.games[WORK_GAME_NAME];
    if (!game || game.type !== "reward") {
      void pluginData.state.common.sendErrorMessage(message, "Work isn't configured on this server.");
      return;
    }

    const result = await claimReward(pluginData, WORK_GAME_NAME, game, message.author.id);

    if (result.type === "error") {
      void pluginData.state.common.sendErrorMessage(message, result.message);
      return;
    }

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const label = game.label ?? "Work";

    const embed = new EmbedBuilder()
      .setColor(result.win ? 0x4caf50 : 0x99aab5)
      .setDescription(
        result.win
          ? `You did **${label}** and earned ${emojiPrefix}**${result.amountChanged}** ${config.currency_name}!\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`
          : `You did **${label}** but came up empty this time.\nNew balance: ${emojiPrefix}**${result.newBalance}** ${config.currency_name}`,
      );

    await message.channel.send({ embeds: [embed] });
  },
});
