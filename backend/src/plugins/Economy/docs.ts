import { ZeppelinPluginDocs } from "../../types.js";
import { zEconomyConfig } from "./types.js";

export const economyPluginDocs: ZeppelinPluginDocs = {
  type: "stable",
  configSchema: zEconomyConfig,

  prettyName: "Economy",
  description:
    "Adds a per-user currency that can be earned by trading in points from a Counters plugin counter and wagered on simple config-defined games",
};
