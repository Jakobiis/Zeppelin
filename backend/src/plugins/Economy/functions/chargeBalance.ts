import { GuildPluginData } from "vety";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";
import { getSpendableBalance } from "./pendingBalance.js";

/** Locks, checks, and deducts `amount` from a user's spendable balance (excluding anything still on hold from a
 * gift) if they have enough. Returns whether it succeeded. */
export async function chargeBalance(
  pluginData: GuildPluginData<EconomyPluginType>,
  counterName: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
  try {
    const { spendable } = await getSpendableBalance(pluginData, counterName, userId);
    if (spendable < amount) {
      return false;
    }
    await pluginData.state.counters.changeCounterValue(counterName, null, userId, -amount);
    return true;
  } finally {
    lock.unlock();
  }
}
