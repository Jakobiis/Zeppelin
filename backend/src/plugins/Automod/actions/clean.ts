import { GuildTextBasedChannel, Snowflake } from "discord.js";
import { z } from "zod";
import { LogType } from "../../../data/LogType.js";
import { noop, nonNullish, unique } from "../../../utils.js";
import { automodAction } from "../helpers.js";

const MAX_RECENT_MESSAGES = 50;

export const CleanAction = automodAction({
  // `true` cleans whatever message(s) the trigger matched on.
  // `{ recent_messages: N }` additionally deletes each matched user's last N messages across the whole server
  // (e.g. for mod-action triggers like `mute`, which don't carry a specific message of their own).
  configSchema: z
    .union([
      z.boolean(),
      z.strictObject({
        recent_messages: z.number().int().min(1).max(MAX_RECENT_MESSAGES),
      }),
    ])
    .default(false),

  async apply({ pluginData, contexts, ruleName, actionConfig }) {
    const messageIdsToDeleteByChannelId: Map<string, string[]> = new Map();

    const queueMessageForDeletion = (channelId: string, messageId: string) => {
      if (!messageIdsToDeleteByChannelId.has(channelId)) {
        messageIdsToDeleteByChannelId.set(channelId, []);
      }

      if (messageIdsToDeleteByChannelId.get(channelId)!.includes(messageId)) {
        // FIXME: Debug
        // tslint:disable-next-line:no-console
        console.warn(`Message ID to delete was already present: ${pluginData.guild.name}, rule ${ruleName}`);
        return;
      }

      messageIdsToDeleteByChannelId.get(channelId)!.push(messageId);
    };

    for (const context of contexts) {
      if (context.message) {
        queueMessageForDeletion(context.message.channel_id, context.message.id);
      }
    }

    const recentMessageCount = typeof actionConfig === "object" ? actionConfig.recent_messages : null;
    if (recentMessageCount) {
      const userIds = unique(contexts.map((c) => c.user?.id ?? c.member?.id).filter(nonNullish));
      for (const userId of userIds) {
        const recentMessages = await pluginData.state.savedMessages.getRecentMessagesByUserForGuild(
          userId,
          recentMessageCount,
        );
        for (const message of recentMessages) {
          queueMessageForDeletion(message.channel_id, message.id);
        }
      }
    }

    for (const [channelId, messageIds] of messageIdsToDeleteByChannelId.entries()) {
      const channel = pluginData.guild.channels.cache.get(channelId as Snowflake) as GuildTextBasedChannel | undefined;
      if (!channel) {
        continue;
      }

      for (const id of messageIds) {
        pluginData.state.logs.ignoreLog(LogType.MESSAGE_DELETE, id);
      }

      await channel.bulkDelete(messageIds as Snowflake[]).catch(noop);
    }
  },
});
