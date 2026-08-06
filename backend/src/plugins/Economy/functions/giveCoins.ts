import { GuildPluginData } from "vety";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";
import { checkCooldown } from "./checkCooldown.js";

export type GiveResult =
  | { type: "error"; message: string }
  | { type: "result"; amountSent: number; amountReceived: number; fee: number; newBalance: number };

export async function giveCoins(
  pluginData: GuildPluginData<EconomyPluginType>,
  giverId: string,
  recipientId: string,
  amount: number,
): Promise<GiveResult> {
  const config = pluginData.config.get();

  if (!Number.isInteger(amount) || amount <= 0) {
    return { type: "error", message: "Amount must be a positive whole number" };
  }

  if (giverId === recipientId) {
    return { type: "error", message: "You can't give coins to yourself" };
  }

  const cooldownKey = `give:${giverId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, config.give.cooldown);
  if (cooldownCheck.onCooldown) {
    return { type: "error", message: cooldownCheck.message };
  }

  // Lock both accounts — a transfer touches two balances, and either side could otherwise race with a
  // concurrent play/trade/give involving the same user.
  const lock = await pluginData.locks.acquire([
    economyUserLock({ id: giverId }),
    economyUserLock({ id: recipientId }),
  ]);
  try {
    const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, giverId);
    if (balance < amount) {
      return {
        type: "error",
        message: `You don't have enough ${config.currency_name} to give that much (balance: ${balance})`,
      };
    }

    const fee = config.give.fee ? Math.floor(amount * config.give.fee) : 0;
    const amountReceived = amount - fee;

    await pluginData.state.counters.changeCounterValue(config.counter_name, null, giverId, -amount);
    if (amountReceived > 0) {
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, recipientId, amountReceived);
    }

    if (cooldownCheck.cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }

    return { type: "result", amountSent: amount, amountReceived, fee, newBalance: balance - amount };
  } finally {
    lock.unlock();
  }
}
