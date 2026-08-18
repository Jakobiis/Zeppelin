import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { renderUsername } from "../../../utils.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { MessageTrackerPluginType } from "../types.js";

export const MessagesCmd = guildPluginMessageCommand<MessageTrackerPluginType>()({
  trigger: ["messages", "m"],
  permission: "can_view",

  signature: {
    member: ct.resolvedMember({ required: false }),
  },

  async run({ pluginData, message, args }) {
    const member = args.member || message.member;
    const counts = await pluginData.state.counts.getForUser(member.id);

    const description = [
      `Today: **${counts.daily.toLocaleString()}**`,
      `This Week: **${counts.weekly.toLocaleString()}**`,
      `This Month: **${counts.monthly.toLocaleString()}**`,
      `All Time: **${counts.allTime.toLocaleString()}**`,
    ].join("\n");

    const embed = new EmbedBuilder()
      .setColor(getGuildEmbedColor(pluginData))
      .setAuthor({ name: `${renderUsername(member)}'s Messages`, iconURL: member.displayAvatarURL() })
      .setThumbnail(member.displayAvatarURL())
      .setDescription(description)
      .setTimestamp();

    const config = await pluginData.config.getForMessage(message);
    if (config.footer_text) {
      embed.setFooter({ text: config.footer_text });
    }

    await message.channel.send({ embeds: [embed] });
  },
});
