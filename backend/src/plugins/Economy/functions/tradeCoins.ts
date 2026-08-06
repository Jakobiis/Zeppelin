import { GuildPluginData } from "vety";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType } from "../types.js";

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

      const coinsGained = Math.floor(amount / trade.points_per_coin);
      if (coinsGained <= 0) {
        return {
          type: "error",
          message: `You need at least ${trade.points_per_coin} points to buy 1 ${config.currency_name}`,
        };
      }

      // Only charge for the points that actually converted, so no partial-coin remainder is lost
      const actualPointsCost = coinsGained * trade.points_per_coin;

      await pluginData.state.counters.changeCounterValue(trade.points_counter_name, null, userId, -actualPointsCost);
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, coinsGained);

      const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

      return { type: "result", direction, spent: actualPointsCost, received: coinsGained, newBalance };
    }

    // amount = coins the user wants to sell
    const coinBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
    if (coinBalance < amount) {
      return { type: "error", message: `You don't have that many ${config.currency_name} (balance: ${coinBalance})` };
    }

    const sellRate = trade.points_per_coin_sell ?? trade.points_per_coin;
    const pointsGained = Math.floor(amount * sellRate);

    await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, -amount);
    await pluginData.state.counters.changeCounterValue(trade.points_counter_name, null, userId, pointsGained);

    const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

    return { type: "result", direction, spent: amount, received: pointsGained, newBalance };
  } finally {
    lock.unlock();
  }
}
