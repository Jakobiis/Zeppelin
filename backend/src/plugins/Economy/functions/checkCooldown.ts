import { GuildPluginData } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { EconomyPluginType } from "../types.js";

export type CooldownCheck =
  | { onCooldown: true; message: string }
  | { onCooldown: false; cooldownMs: number | null };

/**
 * Shared by playGame() and claimReward() — both key their per-user cooldown into the same
 * `pluginData.state.lastPlayedAt` map by `${gameName}:${userId}`, so a wager game and a reward game can never
 * collide since game names are already unique within the `games` config.
 */
export function checkCooldown(
  pluginData: GuildPluginData<EconomyPluginType>,
  cooldownKey: string,
  cooldown: string | null,
): CooldownCheck {
  const cooldownMs = cooldown ? convertDelayStringToMS(cooldown) : null;
  if (!cooldownMs) {
    return { onCooldown: false, cooldownMs: null };
  }

  const lastPlayedAt = pluginData.state.lastPlayedAt.get(cooldownKey);
  if (lastPlayedAt) {
    const remainingMs = cooldownMs - (Date.now() - lastPlayedAt);
    if (remainingMs > 0) {
      return {
        onCooldown: true,
        message: `You can do this again in ${humanizeDuration(remainingMs, { round: true })}`,
      };
    }
  }

  return { onCooldown: false, cooldownMs };
}
