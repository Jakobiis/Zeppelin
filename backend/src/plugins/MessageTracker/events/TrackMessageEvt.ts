import { guildPluginEventListener } from "vety";
import { MessageTrackerPluginType } from "../types.js";

export const TrackMessageEvt = guildPluginEventListener<MessageTrackerPluginType>()({
  event: "messageCreate",
  async listener({ pluginData, args: { message: msg } }) {
    if (!msg.guild) return;
    if (msg.author.bot || msg.webhookId) return;

    const config = await pluginData.config.getForMessage(msg);
    if (config.ignored_channel_ids.includes(msg.channel.id)) return;

    await pluginData.state.counts.recordMessage(msg.author.id);
  },
});
