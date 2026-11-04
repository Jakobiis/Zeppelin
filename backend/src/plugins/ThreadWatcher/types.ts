import { BasePluginType, guildPluginEventListener } from "vety";
import { z } from "zod";
import { zBoundedRecord, zSnowflake } from "../../utils.js";

export const zWatchedThread = z.strictObject({
  // Members with any of these roles are added to the thread
  roles: z.array(zSnowflake).max(25).default([]),
});

export const zThreadWatcherConfig = z.strictObject({
  threads: zBoundedRecord(z.record(zSnowflake, zWatchedThread), 0, 100).default({}),
});

export interface ThreadWatcherPluginType extends BasePluginType {
  configSchema: typeof zThreadWatcherConfig;
  state: {
    checkTimer: NodeJS.Timeout;
  };
}

export const threadWatcherEvt = guildPluginEventListener<ThreadWatcherPluginType>();
