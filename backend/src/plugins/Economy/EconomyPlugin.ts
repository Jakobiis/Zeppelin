import { PluginOverride, guildPlugin } from "vety";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { CountersPlugin } from "../Counters/CountersPlugin.js";
import { BalanceCmd } from "./commands/BalanceCmd.js";
import { EconomyHelpCmd } from "./commands/EconomyHelpCmd.js";
import { GamesCmd } from "./commands/GamesCmd.js";
import { GiveCmd } from "./commands/GiveCmd.js";
import { LeaderboardCmd } from "./commands/LeaderboardCmd.js";
import { PlayCmd } from "./commands/PlayCmd.js";
import { TradeBackCmd } from "./commands/TradeBackCmd.js";
import { TradeCmd } from "./commands/TradeCmd.js";
import { WorkCmd } from "./commands/WorkCmd.js";
import { EconomyPluginType, zEconomyConfig } from "./types.js";

const defaultOverrides: Array<PluginOverride<EconomyPluginType>> = [
  {
    level: ">=50",
    config: {
      can_view: true,
    },
  },
  {
    level: ">=100",
    config: {
      can_play: true,
      can_trade: true,
      can_give: true,
    },
  },
];

/**
 * The Economy plugin adds a per-user currency ("coins" by default, name configurable) that can be earned by
 * trading in points from another Counters-plugin counter (e.g. activity points) and wagered on simple
 * config-defined games. Balances are stored as a regular per-user Counter (see Counters plugin) rather than a
 * separate table, so the same decay/trigger/max_value machinery is available to server admins if they want it.
 */
export const EconomyPlugin = guildPlugin<EconomyPluginType>()({
  name: "economy",

  configSchema: zEconomyConfig,
  defaultOverrides,

  dependencies: () => [CountersPlugin, CommonPlugin],

  // prettier-ignore
  messageCommands: [
    BalanceCmd,
    EconomyHelpCmd,
    GamesCmd,
    GiveCmd,
    LeaderboardCmd,
    PlayCmd,
    TradeCmd,
    TradeBackCmd,
    WorkCmd,
  ],

  beforeLoad(pluginData) {
    pluginData.state.lastPlayedAt = new Map();
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
    pluginData.state.counters = pluginData.getPlugin(CountersPlugin);
  },
});
