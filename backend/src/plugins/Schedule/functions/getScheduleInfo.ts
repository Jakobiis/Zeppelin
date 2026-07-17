import { GuildPluginData } from "vety";
import { SchedulePluginType } from "../types.js";

export interface ScheduleInfo {
  multiplier: number;
  active: boolean;
  activeUntil: number | null;
}

export function getScheduleInfo(pluginData: GuildPluginData<SchedulePluginType>, name: string): ScheduleInfo | null {
  const entry = pluginData.config.get().multipliers[name];
  if (!entry) {
    return null;
  }

  const state = pluginData.state.runtimeStates.get(name);
  return {
    multiplier: entry.multiplier,
    active: state?.active ?? false,
    activeUntil: state?.activeUntil ?? null,
  };
}
