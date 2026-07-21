import { guildPlugin, PluginOverride } from "vety";
import { makePublicFn } from "../../pluginUtils.js";
import { SECONDS } from "../../utils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { TimeAndDatePlugin } from "../TimeAndDate/TimeAndDatePlugin.js";
import { ScheduleMultiplyCmd } from "./commands/ScheduleMultiplyCmd.js";
import { getMultiplier } from "./functions/getMultiplier.js";
import { getScheduleInfo } from "./functions/getScheduleInfo.js";
import { listSchedules } from "./functions/listSchedules.js";
import { scheduleExists } from "./functions/scheduleExists.js";
import { tickSchedules } from "./functions/tickSchedules.js";
import { SchedulePluginType, zScheduleConfig } from "./types.js";

const TICK_INTERVAL = 30 * SECONDS;

const defaultOverrides: Array<PluginOverride<SchedulePluginType>> = [
  {
    level: ">=100",
    config: {
      can_multiply: true,
    },
  },
];

/**
 * The Schedule plugin defines named, time-based multipliers (e.g. "2x points on weekends", or a randomly rolled
 * randomly rolled boost) that other plugins/actions can look up by name. Active/inactive state is recomputed on a tick and
 * cached in state.runtimeStates — this lets random rolls persist across lookups within their active window,
 * and lets fire/reverse transitions be detected in order to send the configured announcement messages.
 */
export const SchedulePlugin = guildPlugin<SchedulePluginType>()({
  name: "schedule",

  configSchema: zScheduleConfig,
  defaultOverrides,

  dependencies: () => [TimeAndDatePlugin, CommonPlugin],

  // prettier-ignore
  messageCommands: [
    ScheduleMultiplyCmd,
  ],

  public(pluginData) {
    return {
      getMultiplier: makePublicFn(pluginData, getMultiplier),
      scheduleExists: makePublicFn(pluginData, scheduleExists),
      getScheduleInfo: makePublicFn(pluginData, getScheduleInfo),
      listSchedules: makePublicFn(pluginData, listSchedules),
    };
  },

  beforeLoad(pluginData) {
    pluginData.state.runtimeStates = new Map();
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
  },

  async afterLoad(pluginData) {
    await tickSchedules(pluginData);
    pluginData.state.tickInterval = setInterval(() => tickSchedules(pluginData), TICK_INTERVAL);
  },

  beforeUnload(pluginData) {
    clearInterval(pluginData.state.tickInterval);
  },
});
