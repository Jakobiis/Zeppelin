import { guildPluginEventListener } from "vety";
import { resolveChannelIds } from "../../../utils/resolveChannelIds.js";
import { MessageTrackerPluginType } from "../types.js";

export const TrackMessageEvt = guildPluginEventListener<MessageTrackerPluginType>()({
  event: "messageCreate",
  async listener({ pluginData, args: { message: msg } }) {
    if (!msg.guild) return;
    if (msg.author.bot || msg.webhookId) return;

    const config = await pluginData.config.getForMessage(msg);
    // Checks the channel itself, its parent category, and (for a thread) its parent channel — so ignoring a
    // category also ignores every channel/thread under it, not just a channel ID entered directly.
    const { channel: channelId, category: categoryId, thread: threadId } = resolveChannelIds(msg.channel);
    if ([channelId, categoryId, threadId].some((id) => id && config.ignored_channel_ids.includes(id))) return;

    await Promise.all([
      pluginData.state.counts.recordMessage(msg.author.id),
      pluginData.state.channelCounts.recordMessage(msg.channel.id, msg.author.id),
    ]);
  },
});
