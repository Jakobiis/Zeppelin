import { GuildPluginData } from "vety";
import { convertDelayStringToMS } from "../../../utils.js";
import { SchedulePluginType } from "../types.js";
import { announceScheduleChange } from "./announceScheduleChange.js";
import { newRuntimeState } from "./tickSchedules.js";

export type TriggerScheduledMultiplierResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "wrong_type" | "already_active" };

/**
 * Manually starts a `duration`-configured schedule's active window (see the `-multiplier`/`-boost` command).
 * Schedules configured with `day_of_week`/`random`/`enabled` are driven entirely by tickSchedules() and can't be
 * started this way.
 */
export async function triggerScheduledMultiplier(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
): Promise<TriggerScheduledMultiplierResult> {
  const config = pluginData.config.get();
  const entry = config.multipliers[name];
  if (!entry) {
    return { ok: false, reason: "not_found" };
  }
  if (entry.duration == null) {
    return { ok: false, reason: "wrong_type" };
  }

  let runtime = pluginData.state.runtimeStates.get(name);
  if (!runtime) {
    runtime = newRuntimeState();
    pluginData.state.runtimeStates.set(name, runtime);
  }
  runtime.lastEntry = entry;
  runtime.initialized = true;

  if (runtime.active) {
    return { ok: false, reason: "already_active" };
  }

  const durationMs = convertDelayStringToMS(entry.duration)!;
  const nowMs = Date.now();
  runtime.activeUntil = nowMs + durationMs;
  runtime.lastDurationMs = durationMs;
  runtime.active = true;
  runtime.lastRemindAt = nowMs;

  await announceScheduleChange(pluginData, name, entry, true, runtime);

  return { ok: true };
}
