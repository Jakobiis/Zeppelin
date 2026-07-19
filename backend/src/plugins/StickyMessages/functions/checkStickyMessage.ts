import { Snowflake } from "discord.js";
import { GuildPluginData } from "vety";
import { z } from "zod";
import { logger } from "../../../logger.js";
import { validateAndParseMessageContent } from "../../../utils.js";
import { StickyMessagesPluginType, zStickyMessage } from "../types.js";

/**
 * Checks whether new messages have been sent in the sticky message's channel since we last posted it there. If so
 * (or if we haven't posted it yet at all), deletes the old sticky message and re-sends it so it stays at the
 * bottom of the channel.
 */
export async function checkStickyMessage(
  pluginData: GuildPluginData<StickyMessagesPluginType>,
  name: string,
  config: z.infer<typeof zStickyMessage>,
) {
  const { state, guild } = pluginData;

  const channel = guild.channels.cache.get(config.channel as Snowflake);
  if (!channel?.isTextBased()) {
    return;
  }

  let row = await state.stickyMessages.find(name);
  if (row && row.channel_id !== config.channel) {
    const oldChannel = guild.channels.cache.get(row.channel_id as Snowflake);
    if (oldChannel?.isTextBased() && row.message_id) {
      await oldChannel.messages.delete(row.message_id as Snowflake).catch(() => null);
    }
    await state.stickyMessages.updateChannel(row.id, config.channel);
    row = { ...row, channel_id: config.channel, message_id: null };
  } else if (!row) {
    row = await state.stickyMessages.create(name, config.channel);
  }

  let lastMessageId: string | undefined;
  try {
    const lastMessages = await channel.messages.fetch({ limit: 1 });
    lastMessageId = lastMessages.first()?.id;
  } catch (err) {
    logger.warn(`[STICKY MESSAGES] Failed to fetch last message in #${channel.name} (${channel.id}): ${err}`);
    return;
  }

  if (lastMessageId && lastMessageId === row.message_id) {
    // Nothing new has been posted since our sticky message went up — leave it where it is
    return;
  }

  if (row.message_id) {
    await channel.messages.delete(row.message_id as Snowflake).catch((err) => {
      logger.warn(
        `[STICKY MESSAGES] Failed to delete old sticky message in #${channel.name} (${channel.id}): ${err}`,
      );
    });
  }

  try {
    const content = validateAndParseMessageContent(config.message);
    const newMessage = await channel.send(content);
    await state.stickyMessages.setMessageId(row.id, newMessage.id);
  } catch (err) {
    logger.warn(`[STICKY MESSAGES] Failed to send sticky message in #${channel.name} (${channel.id}): ${err}`);
  }
}
