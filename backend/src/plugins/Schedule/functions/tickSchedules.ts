import { GuildPluginData } from "vety";
import moment from "moment-timezone";
import { convertDelayStringToMS } from "../../../utils.js";
import { TimeAndDatePlugin } from "../../TimeAndDate/TimeAndDatePlugin.js";
import { ScheduleRuntimeState, SchedulePluginType, zScheduledMultiplier } from "../types.js";
import { announceScheduleChange } from "./announceScheduleChange.js";
import { z } from "zod";

type ScheduledMultiplier = z.infer<typeof zScheduledMultiplier>;

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

export async function tickSchedules(pluginData: GuildPluginData<SchedulePluginType>) {
  const config = pluginData.config.get();
  const timeAndDate = pluginData.getPlugin(TimeAndDatePlugin);
  const now = timeAndDate.inGuildTz();
  const nowMs = Date.now();

  for (const [name, entry] of Object.entries(config.multipliers)) {
    let runtime = pluginData.state.runtimeStates.get(name);
    if (!runtime) {
      runtime = {
        initialized: false,
        active: false,
        activeUntil: null,
        lastDurationMs: null,
        lastRolledBucket: null,
      };
      pluginData.state.runtimeStates.set(name, runtime);
    }

    let active: boolean;
    if (entry.day_of_week != null) {
      active = evaluateDayOfWeek(entry.day_of_week, now);
      if (active) {
        runtime.activeUntil = computeDayOfWeekEnd(entry.day_of_week, now);
      }
    } else {
      active = evaluateRandom(entry.random!, nowMs, runtime);
    }

    if (!runtime.initialized) {
      runtime.initialized = true;
      runtime.active = active;
      continue;
    }

    if (active !== runtime.active) {
      runtime.active = active;
      await announceScheduleChange(pluginData, name, entry, active, runtime);
    }
  }

  for (const name of pluginData.state.runtimeStates.keys()) {
    if (!config.multipliers[name]) {
      pluginData.state.runtimeStates.delete(name);
    }
  }
}
