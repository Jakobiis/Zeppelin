import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";

/** Public-interface entry point for other plugins (namely Giveaways' coins requirement) to find out which
 * Counters-plugin counter this guild's Economy balance is actually stored under, without needing to know or
 * guess the guild's configured name (default "coins", but guild-renameable). */
export function getCounterName(pluginData: GuildPluginData<EconomyPluginType>): string {
  return pluginData.config.get().counter_name;
}
