import { GuildPluginData } from "vety";
import { z } from "zod";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType, zEconomyWagerGame } from "../types.js";
import { checkCooldown } from "./checkCooldown.js";
import { rollNumberOrRange } from "./numberOrRange.js";

export type PlayResult =
  | { type: "error"; message: string }
  | { type: "result"; win: boolean; amountChanged: number; newBalance: number; multiplier: number | null };

export async function playGame(
  pluginData: GuildPluginData<EconomyPluginType>,
  gameName: string,
  game: z.infer<typeof zEconomyWagerGame>,
  userId: string,
  bet: number,
): Promise<PlayResult> {
  const config = pluginData.config.get();

  if (!Number.isInteger(bet) || bet <= 0) {
    return { type: "error", message: "Bet amount must be a positive whole number" };
  }

  if (bet < game.min_bet || bet > game.max_bet) {
    return {
      type: "error",
      message: `Bet must be between ${game.min_bet} and ${game.max_bet} ${config.currency_name}`,
    };
  }

  const cooldownKey = `${gameName}:${userId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    return { type: "error", message: cooldownCheck.message };
  }

  const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
  try {
    const balance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
    if (balance < bet) {
      return {
        type: "error",
        message: `You don't have enough ${config.currency_name} for that bet (balance: ${balance})`,
      };
    }

    const win = Math.random() < game.win_chance;
    let amountChanged: number;
    let multiplier: number | null = null;
    if (win) {
      multiplier = rollNumberOrRange(game.win_multiplier);
      amountChanged = Math.floor(bet * (multiplier - 1));
      if (game.max_payout != null) {
        amountChanged = Math.min(amountChanged, game.max_payout);
      }
    } else {
      amountChanged = -bet;
    }

    await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, amountChanged);

    if (cooldownCheck.cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }

    return { type: "result", win, amountChanged, newBalance: balance + amountChanged, multiplier };
  } finally {
    lock.unlock();
  }
}
