import { GuildPluginData } from "vety";
import { SchedulePluginType } from "../types.js";

export function getMultiplier(pluginData: GuildPluginData<SchedulePluginType>, name: string): number {
  const entry = pluginData.config.get().multipliers[name];
  if (!entry) {
    return 1;
  }

  return pluginData.state.runtimeStates.get(name)?.active ? entry.multiplier : 1;
}
