import { guildPlugin } from "vety";
import { makePublicFn } from "../../pluginUtils.js";
import { SECONDS } from "../../utils.js";
import { TimeAndDatePlugin } from "../TimeAndDate/TimeAndDatePlugin.js";
import { getMultiplier } from "./functions/getMultiplier.js";
import { scheduleExists } from "./functions/scheduleExists.js";
import { tickSchedules } from "./functions/tickSchedules.js";
import { SchedulePluginType, zScheduleConfig } from "./types.js";

const TICK_INTERVAL = 30 * SECONDS;

/**
 * The Schedule plugin defines named, time-based multipliers (e.g. "2x points on weekends", or a randomly rolled
 * hourly boost) that other plugins/actions can look up by name. Active/inactive state is recomputed on a tick and
 * cached in state.runtimeStates — this lets random_hourly rolls persist across lookups within their active window,
 * and lets fire/reverse transitions be detected in order to send the configured announcement messages.
 */
export const SchedulePlugin = guildPlugin<SchedulePluginType>()({
  name: "schedule",

  configSchema: zScheduleConfig,

  dependencies: () => [TimeAndDatePlugin],

  public(pluginData) {
    return {
      getMultiplier: makePublicFn(pluginData, getMultiplier),
      scheduleExists: makePublicFn(pluginData, scheduleExists),
    };
  },

  beforeLoad(pluginData) {
    pluginData.state.runtimeStates = new Map();
  },

  async afterLoad(pluginData) {
    await tickSchedules(pluginData);
    pluginData.state.tickInterval = setInterval(() => tickSchedules(pluginData), TICK_INTERVAL);
  },

  beforeUnload(pluginData) {
    clearInterval(pluginData.state.tickInterval);
  },
});
