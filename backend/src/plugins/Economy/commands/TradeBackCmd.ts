import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { runTrade } from "../functions/runTrade.js";
import { EconomyPluginType } from "../types.js";

export const TradeBackCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["tradeback"],
  permission: "can_trade",

  signature: {
    amount: ct.string(),
  },

  async run({ pluginData, message, args }) {
    await runTrade(pluginData, message, "sell", args.amount);
  },
});
