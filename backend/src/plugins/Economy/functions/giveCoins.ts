import { GuildPluginData } from "vety";
import { convertDelayStringToMS } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";
import { checkCooldown } from "./checkCooldown.js";
import { addPendingHold, getSpendableBalance, pendingHoldCountersConfigured } from "./pendingBalance.js";

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

  // If a hold is configured, fail before touching any balances rather than silently giving out a
  // gift that never actually gets tracked as held.
  const holdDurationMs = config.give.hold_duration ? convertDelayStringToMS(config.give.hold_duration) : null;
  if (config.give.hold_duration && (!holdDurationMs || !pendingHoldCountersConfigured(pluginData))) {
    return {
      type: "error",
      message: "Gift holds are misconfigured on this server (missing the pending-hold counters) — ask an admin to fix this.",
    };
  }

  // Lock both accounts — a transfer touches two balances, and either side could otherwise race with a
  // concurrent play/trade/give involving the same user.
  const lock = await pluginData.locks.acquire([
    economyUserLock({ id: giverId }),
    economyUserLock({ id: recipientId }),
  ]);
  try {
    const { spendable: balance } = await getSpendableBalance(pluginData, config.counter_name, giverId);
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

      if (holdDurationMs) {
        await addPendingHold(pluginData, recipientId, amountReceived, holdDurationMs);
      }
    }

    if (cooldownCheck.cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }

    return { type: "result", amountSent: amount, amountReceived, fee, newBalance: balance - amount };
  } finally {
    lock.unlock();
  }
}
