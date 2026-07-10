import { BasePluginType, guildPluginMessageCommand, pluginUtils } from "vety";
import { z } from "zod";
import { GuildAfkStatuses } from "../../data/GuildAfkStatuses.js";
import { zSnowflake } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";

export const zAfkConfig = z.strictObject({
  can_use: z.boolean().default(false),
  ignored_channel_ids: z.array(zSnowflake).default([]),
});

export interface AFKPluginType extends BasePluginType {
  configSchema: typeof zAfkConfig;
  state: {
    afk: GuildAfkStatuses;
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
  };
}

export const afkCmd = guildPluginMessageCommand<AFKPluginType>();
