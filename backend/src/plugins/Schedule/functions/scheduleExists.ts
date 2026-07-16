import { GuildPluginData } from "vety";
import { SchedulePluginType } from "../types.js";

export function scheduleExists(pluginData: GuildPluginData<SchedulePluginType>, name: string): boolean {
  return name in pluginData.config.get().multipliers;
}
