import { BasePluginType, guildPluginMessageCommand, pluginUtils } from "vety";
import { z } from "zod";
import { GuildScheduleStates } from "../../data/GuildScheduleStates.js";
import { zBoundedCharacters, zBoundedRecord, zDelayString, zMessageContent, zSnowflake } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";

import Timeout = NodeJS.Timeout;

const MAX_MULTIPLIERS = 25;
const MAX_ANNOUNCE_CHANNELS = 10;

const zScheduleAnnounce = z.strictObject({
  channels: z.array(zSnowflake).max(MAX_ANNOUNCE_CHANNELS).default([]),
  fire_message: zMessageContent.nullable().default(null),
  reverse_message: zMessageContent.nullable().default(null),
  // If set, re-sends a reminder message every `remind_every` while the schedule is active (e.g. to remind users a
  // long-running duration-triggered boost is still going). Uses fire_message if remind_message isn't set.
  remind_every: zDelayString.optional(),
  remind_message: zMessageContent.nullable().optional(),
});

export const zScheduledMultiplier = z
  .strictObject({
    pretty_name: zBoundedCharacters(0, 100).nullable().default(null),
    multiplier: z.number().min(0).max(1000),
    // Regex matched against the current day-of-week number (0=Sunday..6=Saturday) in the guild's configured timezone
    day_of_week: zBoundedCharacters(1, 100).optional(),
    // Every `every`, roll `chance`; on success the multiplier is active for a random duration in [duration_min, duration_max]
    random: z
      .strictObject({
        every: zDelayString,
        chance: z.number().min(0).max(1),
        duration_min: zDelayString,
        duration_max: zDelayString,
      })
      .optional(),
    // Hardcoded manual on/off switch — flip this in config and reload to toggle the multiplier
    enabled: z.boolean().optional(),
    // Not active by default: how long the multiplier stays active once started via the `-multiplier`/`-boost` command
    duration: zDelayString.optional(),
    announce: zScheduleAnnounce.optional(),
  })
  .refine(
    (val) => [val.day_of_week != null, val.random != null, val.enabled != null, val.duration != null].filter(Boolean)
      .length === 1,
    {
      message: "Exactly one of `day_of_week`, `random`, `enabled`, or `duration` must be set",
    },
  );

export type ScheduledMultiplier = z.infer<typeof zScheduledMultiplier>;

export const zScheduleConfig = z.strictObject({
  multipliers: zBoundedRecord(z.record(zBoundedCharacters(0, 100), zScheduledMultiplier), 0, MAX_MULTIPLIERS).default(
    {},
  ),
  can_multiply: z.boolean().default(false),
});

export interface ScheduleRuntimeState {
  // Suppresses a spurious fire/reverse announcement on plugin (re)load if the schedule already happened to be active
  initialized: boolean;
  active: boolean;
  // Ms timestamp when the current active period is expected to end; null if undeterminable (e.g. an always-matching day_of_week regex)
  activeUntil: number | null;
  // random/duration only: the exact duration rolled/set for the current/last window, for the {duration} template var
  lastDurationMs: number | null;
  // random only: index of the `every`-sized time bucket that's already been rolled for
  lastRolledBucket: number | null;
  // Ms timestamp `announce.remind_every` reminders are counted from; reset to the activation time whenever the
  // schedule (re)activates, so reminders are spaced out from when it started rather than from server boot
  lastRemindAt: number | null;
  // Snapshot of this schedule's config as of the last tick, kept so a reverse announcement can still be sent with
  // the right message/channels if the schedule is removed from config entirely while active
  lastEntry: ScheduledMultiplier | null;
}

export interface SchedulePluginType extends BasePluginType {
  configSchema: typeof zScheduleConfig;
  state: {
    runtimeStates: Map<string, ScheduleRuntimeState>;
    tickInterval: Timeout;
    common: pluginUtils.PluginPublicInterface<typeof CommonPlugin>;
    scheduleStates: GuildScheduleStates;
  };
}

export const scheduleCmd = guildPluginMessageCommand<SchedulePluginType>();
