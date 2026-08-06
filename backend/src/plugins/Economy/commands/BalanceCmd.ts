import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { EconomyPluginType } from "../types.js";

export const BalanceCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["balance", "coins"],
  permission: "can_view",

  signature: {
    user: ct.resolvedUser({ required: false }),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();
    const targetUser = args.user ?? message.author;
    const isSelf = targetUser.id === message.author.id;

    const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, targetUser.id);

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const who = isSelf ? "You have" : `${targetUser.username} has`;

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setDescription(`${who} ${emojiPrefix}**${balance}** ${config.currency_name}`);

    await message.channel.send({ embeds: [embed] });
  },
});
