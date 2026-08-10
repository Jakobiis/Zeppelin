import { GuildPluginData } from "vety";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";
import { getSpendableBalance } from "./pendingBalance.js";

// Guards floor()/ceil() against float rounding noise (e.g. 3 * 0.1 === 0.30000000000000004) at exchange-rate
// boundaries, so a user isn't shortchanged (or overcharged) by a fraction of a cent's worth of float error.
const RATE_EPSILON = 1e-9;

export type TradeDirection = "buy" | "sell";

export type TradeResult =
  | { type: "error"; message: string }
  | { type: "result"; direction: TradeDirection; spent: number; received: number; newBalance: number };

export async function tradeCoins(
  pluginData: GuildPluginData<EconomyPluginType>,
  direction: TradeDirection,
  userId: string,
  amount: number,
): Promise<TradeResult> {
  const config = pluginData.config.get();
  const trade = config.trade;
  if (!trade) {
    return { type: "error", message: "Trading isn't configured on this server." };
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return { type: "error", message: "Amount must be a positive whole number" };
  }

  const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
  try {
    if (direction === "buy") {
      // amount = points the user wants to spend
      const pointsBalance = await pluginData.state.counters.getCounterValue(
        trade.points_counter_name,
        null,
        userId,
      );
      if (pointsBalance < amount) {
        return { type: "error", message: `You don't have that many points (balance: ${pointsBalance})` };
      }

      const coinsGained = Math.floor(amount * trade.coins_per_point + RATE_EPSILON);
      if (coinsGained <= 0) {
        const pointsNeeded = Math.ceil(1 / trade.coins_per_point - RATE_EPSILON);
        return {
          type: "error",
          message: `You need at least ${pointsNeeded} points to buy 1 ${config.currency_name}`,
        };
      }

      // Only charge for the points that actually converted, so no partial-coin remainder is lost
      const actualPointsCost = Math.ceil(coinsGained / trade.coins_per_point - RATE_EPSILON);

      await pluginData.state.counters.changeCounterValue(trade.points_counter_name, null, userId, -actualPointsCost);
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, coinsGained);

      const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

      return { type: "result", direction, spent: actualPointsCost, received: coinsGained, newBalance };
    }

    // amount = coins the user wants to sell
    const { spendable: coinBalance } = await getSpendableBalance(pluginData, config.counter_name, userId);
    if (coinBalance < amount) {
      return { type: "error", message: `You don't have that many ${config.currency_name} (balance: ${coinBalance})` };
    }

    const sellRate = trade.coins_per_point_sell ?? trade.coins_per_point;
    const pointsGained = Math.floor(amount / sellRate + RATE_EPSILON);

    await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, -amount);
    await pluginData.state.counters.changeCounterValue(trade.points_counter_name, null, userId, pointsGained);

    const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

    return { type: "result", direction, spent: amount, received: pointsGained, newBalance };
  } finally {
    lock.unlock();
  }
}
