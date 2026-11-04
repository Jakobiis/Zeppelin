import { BasePluginType, guildPluginEventListener } from "vety";
import { z } from "zod";
import { zSnowflake } from "../../utils.js";

export const zThreadWatcherConfig = z.strictObject({
  threads: z.array(zSnowflake).max(100).default([]),
});

export interface ThreadWatcherPluginType extends BasePluginType {
  configSchema: typeof zThreadWatcherConfig;
  state: {
    checkTimer: NodeJS.Timeout;
  };
}

export const threadWatcherEvt = guildPluginEventListener<ThreadWatcherPluginType>();
