import { GuildPluginData } from "vety";
import { TemplateSafeValueContainer } from "../../../templateFormatter.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { ScheduledMultiplier, ScheduleRuntimeState, SchedulePluginType } from "../types.js";
import { sendScheduleAnnouncement } from "./sendScheduleAnnouncement.js";

export async function announceScheduleReminder(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
  entry: ScheduledMultiplier,
  runtime: ScheduleRuntimeState,
) {
  const message = entry.announce?.remind_message ?? entry.announce?.fire_message;
  const channels = entry.announce?.channels;
  if (!message || !channels?.length) {
    return;
  }

  const templateValues = new TemplateSafeValueContainer({
    schedule: name,
    multiplier: entry.multiplier,
    ends: runtime.activeUntil != null ? Math.floor(runtime.activeUntil / 1000) : null,
    duration: runtime.lastDurationMs != null ? humanizeDuration(runtime.lastDurationMs, { round: true }) : null,
  });

  await sendScheduleAnnouncement(pluginData, name, "reminder", channels, message, templateValues);
}
