import { ZeppelinPluginDocs } from "../../types.js";
import { zEconomyConfig } from "./types.js";

export const economyPluginDocs: ZeppelinPluginDocs = {
  type: "stable",
  configSchema: zEconomyConfig,

  prettyName: "Economy",
  description:
    "Adds a per-user currency that can be earned by trading in points from a Counters plugin counter and wagered on simple config-defined games. Also includes a shop (`!shop`, `!shop buy <item>`, `!shop status`) where coins buy temporary boosts — either a multiplier on coin winnings, or (if an Automod `add_to_counter` rule like `accumulate_activity` is set up) on activity point gains — each with its own price, duration, and optional limited/restocking stock.",
};
