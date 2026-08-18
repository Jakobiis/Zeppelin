import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";

/**
 * Multiplies net winnings by the user's active "coins" shop boost, if any — a no-op (returns netAmount
 * unchanged) if they don't have one active, or if netAmount isn't positive (never boost a loss/refund into being
 * more negative, or boost 0 into something nonzero). Only ever call this with the *net winnings* portion of a
 * payout (winnings minus the returned stake) — boosting the whole payout would also multiply the player's own
 * money being handed back to them.
 */
export async function applyCoinsBoost(
  pluginData: GuildPluginData<EconomyPluginType>,
  userId: string,
  netAmount: number,
): Promise<number> {
  if (netAmount <= 0) return netAmount;

  const boost = await pluginData.state.shop.getActiveBoost(userId, "coins");
  if (!boost) return netAmount;

  return Math.floor(netAmount * boost.multiplier);
}
