import { GuildPluginData } from "vety";
import moment from "moment-timezone";
import { SchedulePluginType } from "../types.js";
import { newRuntimeState } from "./tickSchedules.js";

/**
 * Re-hydrates runtimeStates from the DB on plugin load, so an active `duration`/`random` window (e.g. a boost
 * started via the `-multiplier`/`-boost` command) survives a bot restart instead of silently ending. Must run
 * before the first tickSchedules() call — that's what turns a since-expired restored window back off (and sends
 * the reverse announcement) or lets a still-active one continue uninterrupted.
 */
export async function restoreScheduleStates(pluginData: GuildPluginData<SchedulePluginType>) {
  const rows = await pluginData.state.scheduleStates.all();

  for (const row of rows) {
    const runtime = newRuntimeState();
    runtime.initialized = true;
    runtime.active = row.active;
    runtime.activeUntil = row.active_until != null ? moment.utc(row.active_until).valueOf() : null;
    runtime.lastDurationMs = row.last_duration_ms != null ? Number(row.last_duration_ms) : null;
    runtime.lastRolledBucket = row.last_rolled_bucket != null ? Number(row.last_rolled_bucket) : null;
    runtime.lastRemindAt = row.last_remind_at != null ? moment.utc(row.last_remind_at).valueOf() : null;
    pluginData.state.runtimeStates.set(row.schedule_name, runtime);
  }
}
