import { GuildPluginData } from "vety";
import { z } from "zod";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType, zEconomyGame } from "../types.js";

export type PlayResult =
  | { type: "error"; message: string }
  | { type: "result"; win: boolean; amountChanged: number; newBalance: number };

export async function playGame(
  pluginData: GuildPluginData<EconomyPluginType>,
  gameName: string,
  game: z.infer<typeof zEconomyGame>,
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
  const cooldownMs = game.cooldown ? convertDelayStringToMS(game.cooldown) : null;
  if (cooldownMs) {
    const lastPlayedAt = pluginData.state.lastPlayedAt.get(cooldownKey);
    if (lastPlayedAt) {
      const remainingMs = cooldownMs - (Date.now() - lastPlayedAt);
      if (remainingMs > 0) {
        return {
          type: "error",
          message: `You can play this game again in ${humanizeDuration(remainingMs, { round: true })}`,
        };
      }
    }
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
    if (win) {
      amountChanged = Math.floor(bet * (game.win_multiplier - 1));
      if (game.max_payout != null) {
        amountChanged = Math.min(amountChanged, game.max_payout);
      }
    } else {
      amountChanged = -bet;
    }

    await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, amountChanged);

    if (cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }

    return { type: "result", win, amountChanged, newBalance: balance + amountChanged };
  } finally {
    lock.unlock();
  }
}
