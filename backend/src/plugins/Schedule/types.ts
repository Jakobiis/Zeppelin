import { BasePluginType } from "vety";
import { z } from "zod";
import { zBoundedCharacters, zBoundedRecord, zDelayString, zMessageContent, zSnowflake } from "../../utils.js";

import Timeout = NodeJS.Timeout;

const MAX_MULTIPLIERS = 25;
const MAX_ANNOUNCE_CHANNELS = 10;

const zScheduleAnnounce = z.strictObject({
  channels: z.array(zSnowflake).max(MAX_ANNOUNCE_CHANNELS).default([]),
  fire_message: zMessageContent.nullable().default(null),
  reverse_message: zMessageContent.nullable().default(null),
});

export const zScheduledMultiplier = z
  .strictObject({
    multiplier: z.number().min(0).max(1000),
    // Regex matched against the current day-of-week number (0=Sunday..6=Saturday) in the guild's configured timezone
    day_of_week: zBoundedCharacters(1, 100).optional(),
    // Once per hour, roll `chance`; on success the multiplier is active for a random duration in [duration_min, duration_max]
    random_hourly: z
      .strictObject({
        chance: z.number().min(0).max(1),
        duration_min: zDelayString,
        duration_max: zDelayString,
      })
      .optional(),
    announce: zScheduleAnnounce.optional(),
  })
  .refine((val) => (val.day_of_week != null) !== (val.random_hourly != null), {
    message: "Exactly one of `day_of_week` or `random_hourly` must be set",
  });

export const zScheduleConfig = z.strictObject({
  multipliers: zBoundedRecord(z.record(zBoundedCharacters(0, 100), zScheduledMultiplier), 0, MAX_MULTIPLIERS).default(
    {},
  ),
});

export interface ScheduleRuntimeState {
  // Suppresses a spurious fire/reverse announcement on plugin (re)load if the schedule already happened to be active
  initialized: boolean;
  active: boolean;
  // Ms timestamp when the current active period is expected to end; null if undeterminable (e.g. an always-matching day_of_week regex)
  activeUntil: number | null;
  // random_hourly only: the exact duration rolled for the current/last window, for the {duration} template var
  lastDurationMs: number | null;
  // random_hourly only: guild-tz "YYYY-MM-DD-HH" bucket that's already been rolled for
  lastRolledHourKey: string | null;
}

export interface SchedulePluginType extends BasePluginType {
  configSchema: typeof zScheduleConfig;
  state: {
    runtimeStates: Map<string, ScheduleRuntimeState>;
    tickInterval: Timeout;
  };
}
