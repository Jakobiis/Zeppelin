import { GuildPluginData } from "vety";
import { SchedulePluginType } from "../types.js";
import { announceScheduleChange } from "./announceScheduleChange.js";
import { persistScheduleState } from "./persistScheduleState.js";

export type CancelScheduledMultiplierResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "wrong_type" | "not_active" };

/**
 * Manually ends a `duration`-configured schedule's active window early (see the `-multiplier cancel`/`-boost
 * cancel` command). Counterpart to triggerScheduledMultiplier().
 */
export async function cancelScheduledMultiplier(
  pluginData: GuildPluginData<SchedulePluginType>,
  name: string,
): Promise<CancelScheduledMultiplierResult> {
  const config = pluginData.config.get();
  const entry = config.multipliers[name];
  if (!entry) {
    return { ok: false, reason: "not_found" };
  }
  if (entry.duration == null) {
    return { ok: false, reason: "wrong_type" };
  }

  const runtime = pluginData.state.runtimeStates.get(name);
  if (!runtime?.active) {
    return { ok: false, reason: "not_active" };
  }

  runtime.active = false;
  runtime.activeUntil = null;
  runtime.lastDurationMs = null;

  await persistScheduleState(pluginData, name, runtime);
  await announceScheduleChange(pluginData, name, entry, false, runtime);

  return { ok: true };
}
