import { GuildPluginData } from "vety";
import { BoostType } from "../../../data/GuildEconomyShop.js";
import { EconomyPluginType } from "../types.js";

/** Public-interface entry point for other plugins (namely Automod's add_to_counter action) to check whether a
 * user currently has an active shop boost of the given type — returns 1 (no-op) if they don't. */
export async function getActiveBoostMultiplier(
  pluginData: GuildPluginData<EconomyPluginType>,
  userId: string,
  boostType: BoostType,
): Promise<number> {
  const boost = await pluginData.state.shop.getActiveBoost(userId, boostType);
  return boost?.multiplier ?? 1;
}
