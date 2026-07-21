import { GuildPluginData } from "vety";
import { SchedulePluginType } from "../types.js";
import { ScheduleInfo, getScheduleInfo } from "./getScheduleInfo.js";

export interface ScheduleListEntry extends ScheduleInfo {
  name: string;
}

export function listSchedules(pluginData: GuildPluginData<SchedulePluginType>): ScheduleListEntry[] {
  const names = Object.keys(pluginData.config.get().multipliers);
  return names.map((name) => ({ name, ...getScheduleInfo(pluginData, name)! }));
}
