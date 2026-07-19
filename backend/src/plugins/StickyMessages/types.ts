import { BasePluginType } from "vety";
import { z } from "zod";
import { GuildStickyMessages } from "../../data/GuildStickyMessages.js";
import { zBoundedCharacters, zBoundedRecord, zDelayString, zMessageContent, zSnowflake } from "../../utils.js";

const MAX_STICKY_MESSAGES = 10;

export const zStickyMessage = z.strictObject({
  channel: zSnowflake,
  message: zMessageContent,
  check_interval: zDelayString,
});

export const zStickyMessagesConfig = z.strictObject({
  messages: zBoundedRecord(z.record(zBoundedCharacters(0, 100), zStickyMessage), 0, MAX_STICKY_MESSAGES).default({}),
});

export interface StickyMessagesPluginType extends BasePluginType {
  configSchema: typeof zStickyMessagesConfig;
  state: {
    stickyMessages: GuildStickyMessages;
    checkTimers: NodeJS.Timeout[];
  };
}
