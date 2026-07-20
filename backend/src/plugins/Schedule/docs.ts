import { ZeppelinPluginDocs } from "../../types.js";
import { zScheduleConfig } from "./types.js";

export const schedulePluginDocs: ZeppelinPluginDocs = {
  type: "stable",
  configSchema: zScheduleConfig,

  prettyName: "Schedule",
  description:
    "Define named, time-based multipliers (e.g. '2x points on weekends', a random hourly boost, a manually-toggled hardcoded boost, or a boost that staff trigger on demand for a set duration) that other plugins/actions can reference by name",
};
