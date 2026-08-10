import { GuildPluginData } from "vety";
import { z } from "zod";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { EconomyPluginType, zEconomyRewardGame } from "../types.js";
import { checkCooldown } from "./checkCooldown.js";
import { logGameHistory } from "./gameHistory.js";
import { rollNumberOrRange } from "./numberOrRange.js";
import { applyGameHold } from "./pendingBalance.js";

export type ClaimRewardResult =
  | { type: "error"; message: string }
  | { type: "result"; win: boolean; amountChanged: number; newBalance: number };

export async function claimReward(
  pluginData: GuildPluginData<EconomyPluginType>,
  gameName: string,
  game: z.infer<typeof zEconomyRewardGame>,
  userId: string,
): Promise<ClaimRewardResult> {
  const config = pluginData.config.get();

  const cooldownKey = `${gameName}:${userId}`;
  const cooldownCheck = checkCooldown(pluginData, cooldownKey, game.cooldown);
  if (cooldownCheck.onCooldown) {
    return { type: "error", message: cooldownCheck.message };
  }

  const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
  try {
    const win = Math.random() < game.win_chance;
    const amountChanged = win ? Math.floor(rollNumberOrRange(game.reward)) : 0;

    if (amountChanged !== 0) {
      await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, amountChanged);
    }

    if (win && amountChanged > 0) {
      await applyGameHold(pluginData, userId, amountChanged, game.hold);
    }

    if (cooldownCheck.cooldownMs) {
      pluginData.state.lastPlayedAt.set(cooldownKey, Date.now());
    }

    const newBalance = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);

    await logGameHistory(pluginData, {
      userId,
      gameName,
      gameType: "reward",
      outcome: win ? "win" : "loss",
      betAmount: 0,
      amountChanged,
      balanceAfter: newBalance,
    });

    return { type: "result", win, amountChanged, newBalance };
  } finally {
    lock.unlock();
  }
}
