import { ZeppelinPluginDocs } from "../../types.js";
import { zScheduleConfig } from "./types.js";

export const schedulePluginDocs: ZeppelinPluginDocs = {
  type: "stable",
  configSchema: zScheduleConfig,

  prettyName: "Schedule",
  description:
    "Define named, time-based multipliers (e.g. '2x points on weekends') that other plugins/actions can reference by name",
};
