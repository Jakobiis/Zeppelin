import { GuildPluginData } from "vety";
import moment from "moment-timezone";
import { convertDelayStringToMS } from "../../../utils.js";
import { TimeAndDatePlugin } from "../../TimeAndDate/TimeAndDatePlugin.js";
import { ScheduledMultiplier, ScheduleRuntimeState, SchedulePluginType } from "../types.js";
import { announceScheduleChange } from "./announceScheduleChange.js";
import { announceScheduleReminder } from "./announceScheduleReminder.js";
import { persistScheduleState } from "./persistScheduleState.js";

function evaluateDayOfWeek(pattern: string, now: moment.Moment): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return false;
  }
  return regex.test(String(now.day()));
}

function computeDayOfWeekEnd(pattern: string, now: moment.Moment): number | null {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return null;
  }

  let cursor = now.clone().startOf("day");
  for (let i = 0; i < 8; i++) {
    const next = cursor.clone().add(1, "day");
    if (!regex.test(String(next.day()))) {
      return cursor.endOf("day").valueOf(); // cursor is the last matching day
    }
    cursor = next;
  }

  return null; // matched every day checked (e.g. an always-on regex) — no defined end
}

function evaluateRandom(
  cfg: NonNullable<ScheduledMultiplier["random"]>,
  nowMs: number,
  runtime: ScheduleRuntimeState,
): boolean {
  if (runtime.activeUntil != null) {
    if (nowMs < runtime.activeUntil) {
      return true; // still within the previously rolled active window
    }
    runtime.activeUntil = null;
    runtime.lastDurationMs = null;
  }

  const everyMs = convertDelayStringToMS(cfg.every)!;
  const bucket = Math.floor(nowMs / everyMs);
  if (runtime.lastRolledBucket === bucket) {
    return false; // already rolled (and missed, or already expired) for this `every` window
  }
  runtime.lastRolledBucket = bucket;

  if (Math.random() >= cfg.chance) {
    return false;
  }

  const min = convertDelayStringToMS(cfg.duration_min)!;
  const max = convertDelayStringToMS(cfg.duration_max)!;
  const duration = min + Math.random() * (max - min);
  runtime.lastDurationMs = duration;
  runtime.activeUntil = nowMs + duration;
  return true;
}

// duration mode never rolls itself active — it's only started externally via triggerScheduledMultiplier(). This just
// detects when a previously started window has run out and needs to be turned back off.
function evaluateDuration(nowMs: number, runtime: ScheduleRuntimeState): boolean {
  if (runtime.activeUntil == null) {
    return false;
  }
  if (nowMs < runtime.activeUntil) {
    return true;
  }
  runtime.activeUntil = null;
  runtime.lastDurationMs = null;
  return false;
}

export function newRuntimeState(): ScheduleRuntimeState {
  return {
    initialized: false,
    active: false,
    activeUntil: null,
    lastDurationMs: null,
    lastRolledBucket: null,
    lastRemindAt: null,
    lastEntry: null,
  };
}

export async function tickSchedules(pluginData: GuildPluginData<SchedulePluginType>) {
  const config = pluginData.config.get();
  const timeAndDate = pluginData.getPlugin(TimeAndDatePlugin);
  const now = timeAndDate.inGuildTz();
  const nowMs = Date.now();

  for (const [name, entry] of Object.entries(config.multipliers)) {
    let runtime = pluginData.state.runtimeStates.get(name);
    if (!runtime) {
      runtime = newRuntimeState();
      pluginData.state.runtimeStates.set(name, runtime);
    }
    runtime.lastEntry = entry;
    const bucketBeforeTick = runtime.lastRolledBucket;

    let active: boolean;
    if (entry.day_of_week != null) {
      active = evaluateDayOfWeek(entry.day_of_week, now);
      if (active) {
        runtime.activeUntil = computeDayOfWeekEnd(entry.day_of_week, now);
      }
    } else if (entry.random != null) {
      active = evaluateRandom(entry.random, nowMs, runtime);
    } else if (entry.enabled != null) {
      active = entry.enabled;
    } else {
      active = evaluateDuration(nowMs, runtime);
    }

    // Only `duration`/`random` schedules carry state (an active window/dedup bucket) that isn't fully derivable
    // from config + the current time, so those are the only ones worth persisting for restart recovery.
    const persistable = entry.duration != null || entry.random != null;

    if (!runtime.initialized) {
      runtime.initialized = true;
      runtime.active = active;
      if (active) {
        runtime.lastRemindAt = nowMs;
      }
      if (persistable) {
        await persistScheduleState(pluginData, name, runtime);
      }
      continue;
    }

    if (active !== runtime.active) {
      runtime.active = active;
      if (active) {
        runtime.lastRemindAt = nowMs;
      }
      if (persistable) {
        await persistScheduleState(pluginData, name, runtime);
      }
      await announceScheduleChange(pluginData, name, entry, active, runtime);
    } else if (active && entry.announce?.remind_every) {
      const remindMs = convertDelayStringToMS(entry.announce.remind_every);
      if (remindMs && runtime.lastRemindAt != null && nowMs - runtime.lastRemindAt >= remindMs) {
        runtime.lastRemindAt = nowMs;
        if (persistable) {
          await persistScheduleState(pluginData, name, runtime);
        }
        await announceScheduleReminder(pluginData, name, entry, runtime);
      }
    } else if (persistable && entry.random != null && runtime.lastRolledBucket !== bucketBeforeTick) {
      // Random schedules can roll (and update lastRolledBucket) on a tick where `active` doesn't change — persist
      // that too so a restart mid-window can't re-roll the same bucket for a second chance.
      await persistScheduleState(pluginData, name, runtime);
    }
  }

  // Config no longer has these schedules (removed, or renamed) — if one was active, send the reverse announcement
  // (using the last config we saw for it, since it's no longer in the live config) before dropping its state.
  for (const [name, runtime] of pluginData.state.runtimeStates.entries()) {
    if (config.multipliers[name]) {
      continue;
    }
    if (runtime.active && runtime.lastEntry) {
      runtime.active = false;
      await announceScheduleChange(pluginData, name, runtime.lastEntry, false, runtime);
    }
    pluginData.state.runtimeStates.delete(name);
    await pluginData.state.scheduleStates.delete(name);
  }
}
