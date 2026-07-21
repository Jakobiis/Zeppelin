import { GuildPluginData } from "vety";
import moment from "moment-timezone";
import { DBDateFormat } from "../../../utils.js";
import { ScheduleRuntimeState, SchedulePluginType } from "../types.js";

/**
 * Saves the parts of a schedule's runtime state that can't be recomputed from config alone (the active window for
 * `duration`/`random` schedules) so it survives a bot restart. See restoreScheduleStates() for the reverse.
 */
export async function persistScheduleState(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
  runtime: ScheduleRuntimeState,
) {
  await pluginData.state.scheduleStates.upsert(name, {
    active: runtime.active,
    active_until: runtime.activeUntil != null ? moment.utc(runtime.activeUntil).format(DBDateFormat) : null,
    last_duration_ms: runtime.lastDurationMs != null ? String(Math.round(runtime.lastDurationMs)) : null,
    last_rolled_bucket: runtime.lastRolledBucket != null ? String(runtime.lastRolledBucket) : null,
    last_remind_at: runtime.lastRemindAt != null ? moment.utc(runtime.lastRemindAt).format(DBDateFormat) : null,
  });
}
