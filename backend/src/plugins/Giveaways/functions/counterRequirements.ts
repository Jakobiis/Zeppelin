import { GuildPluginData } from "vety";
import { GuildCounters } from "../../../data/GuildCounters.js";
import { GiveawaysPluginType } from "../types.js";

/**
 * A named counter's current value for one user (the guild-wide, not-per-channel row — the only shape that
 * makes sense as a per-user eligibility check). Reads 0 for a counter that doesn't exist yet, or that isn't
 * tracked per-user — this is a read-only lookup (see GuildCounters.findCounterByName), so entering a giveaway
 * never creates a counter as a side effect.
 */
export async function getNamedCounterValueForUser(guildId: string, counterName: string, userId: string): Promise<number> {
  const repo = GuildCounters.getGuildInstance(guildId);
  const counter = await repo.findCounterByName(counterName);
  if (!counter) {
    return 0;
  }
  const value = await repo.getCurrentValue(counter.id, null, counter.per_user ? userId : null);
  return value ?? 0;
}

/**
 * A user's Economy balance, read the same way as any other named-counter requirement — coins are just a
 * regular Counter under the hood (see EconomyPlugin's public getCounterName()). Soft dependency: Economy isn't
 * installed on every guild, so this dynamically imports and checks pluginData.hasPlugin() rather than
 * declaring a hard dependency, same pattern as Automod's add_to_counter action. Returns null (not 0) if
 * Economy isn't installed here, so the caller can tell "no balance" apart from "Economy isn't set up" if it
 * cares to.
 */
export async function getCoinsValueForUser(pluginData: GuildPluginData<GiveawaysPluginType>, userId: string): Promise<number | null> {
  try {
    const { EconomyPlugin } = await import("../../Economy/EconomyPlugin.js");
    if (!pluginData.hasPlugin(EconomyPlugin)) {
      return null;
    }
    const counterName = pluginData.getPlugin(EconomyPlugin).getCounterName();
    return await getNamedCounterValueForUser(pluginData.guild.id, counterName, userId);
  } catch {
    return null;
  }
}
