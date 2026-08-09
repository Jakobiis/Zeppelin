import { GuildPluginData } from "vety";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";

/** Locks, checks, and deducts `amount` from a user's balance if they have enough. Returns whether it succeeded. */
export async function chargeBalance(
  pluginData: GuildPluginData<EconomyPluginType>,
  counterName: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
  try {
    const balance = await pluginData.state.counters.getCounterValue(counterName, null, userId);
    if (balance < amount) {
      return false;
    }
    await pluginData.state.counters.changeCounterValue(counterName, null, userId, -amount);
    return true;
  } finally {
    lock.unlock();
  }
}
