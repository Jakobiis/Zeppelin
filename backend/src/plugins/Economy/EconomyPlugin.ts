import { PluginOverride, guildPlugin } from "vety";
import { GuildEconomyGameHistory } from "../../data/GuildEconomyGameHistory.js";
import { GuildEconomyShop } from "../../data/GuildEconomyShop.js";
import { makePublicFn } from "../../pluginUtils.js";
import { CommonPlugin } from "../Common/CommonPlugin.js";
import { CountersPlugin } from "../Counters/CountersPlugin.js";
import { BalanceCmd } from "./commands/BalanceCmd.js";
import { EconomyHelpCmd } from "./commands/EconomyHelpCmd.js";
import { GameHistoryCmd } from "./commands/GameHistoryCmd.js";
import { GamesCmd } from "./commands/GamesCmd.js";
import { GiveCmd } from "./commands/GiveCmd.js";
import { LeaderboardCmd } from "./commands/LeaderboardCmd.js";
import { PlayCmd } from "./commands/PlayCmd.js";
import { PvpToggleCmd } from "./commands/PvpToggleCmd.js";
import { ShopBuyCmd } from "./commands/ShopBuyCmd.js";
import { ShopCmd } from "./commands/ShopCmd.js";
import { ShopStatusCmd } from "./commands/ShopStatusCmd.js";
import { TradeBackCmd } from "./commands/TradeBackCmd.js";
import { TradeCmd } from "./commands/TradeCmd.js";
import { WorkCmd } from "./commands/WorkCmd.js";
import { getActiveBoostMultiplier } from "./functions/getActiveBoostMultiplier.js";
import { getCounterName } from "./functions/getCounterName.js";
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
      can_shop: true,
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

  // Exposed for other plugins to optionally consult (namely Automod's add_to_counter action, which looks this up
  // dynamically rather than depending on Economy directly — see Automod/actions/addToCounter.ts) — Economy isn't
  // installed on every server, so nothing should hard-depend on it just for boost lookups.
  public(pluginData) {
    return {
      getActiveBoostMultiplier: makePublicFn(pluginData, getActiveBoostMultiplier),
      getCounterName: makePublicFn(pluginData, getCounterName),
    };
  },

  // prettier-ignore
  messageCommands: [
    BalanceCmd,
    EconomyHelpCmd,
    GameHistoryCmd,
    GamesCmd,
    GiveCmd,
    LeaderboardCmd,
    PlayCmd,
    PvpToggleCmd,
    ShopCmd,
    ShopBuyCmd,
    ShopStatusCmd,
    TradeCmd,
    TradeBackCmd,
    WorkCmd,
  ],

  beforeLoad(pluginData) {
    pluginData.state.lastPlayedAt = new Map();
    pluginData.state.shop = GuildEconomyShop.getGuildInstance(pluginData.guild.id);
  },

  beforeStart(pluginData) {
    pluginData.state.common = pluginData.getPlugin(CommonPlugin);
    pluginData.state.counters = pluginData.getPlugin(CountersPlugin);
    pluginData.state.gameHistory = GuildEconomyGameHistory.getGuildInstance(pluginData.guild.id);
  },
});
