import { BasePluginType, pluginUtils } from "vety";
import { z } from "zod";
import { GuildMessageTrackerCounts } from "../../data/GuildMessageTrackerCounts.js";
import { zBoundedCharacters, zSnowflake } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";

export const zMessageTrackerConfig = z.strictObject({
  // Channels excluded from message counts entirely (e.g. a bot-commands channel you don't want inflating stats).
  ignored_channel_ids: z.array(zSnowflake).default([]),
  // Shown in the footer of `-messages`/`-m`'s embed. Null omits the footer entirely.
  footer_text: zBoundedCharacters(0, 256).nullable().default("Jailbreak Changelogs"),
  can_view: z.boolean().default(false),
  // Lets staff overwrite a member's tracked message counts (`-messages set`) — deliberately separate from
  // can_view so granting "check your own/others' stats" doesn't also grant "rewrite anyone's stats".
  can_manage: z.boolean().default(false),
  // Lets staff run `-messages import` (paste stats copied from another bot, e.g. when migrating off it) —
  // separate from can_manage since it's realistically only needed by a couple of people during a one-time
  // migration, not part of regular moderation.
  can_import: z.boolean().default(false),
});

export interface MessageTrackerPluginType extends BasePluginType {
  configSchema: typeof zMessageTrackerConfig;
  state: {
    counts: GuildMessageTrackerCounts;
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
  };
}
