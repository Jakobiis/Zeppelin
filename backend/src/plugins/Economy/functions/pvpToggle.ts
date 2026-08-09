import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";

// Per-user counter (must be configured in this server's YAML under counters:) used purely as a persistent
// opt-out flag — see PvpToggleCmd. A value >0 means the user does not want to receive PvP challenge pings.
export const PVP_CHALLENGES_DISABLED_COUNTER_NAME = "pvp_challenges_disabled";

export async function isPvpDisabled(pluginData: GuildPluginData<EconomyPluginType>, userId: string): Promise<boolean> {
  if (!pluginData.state.counters.counterExists(PVP_CHALLENGES_DISABLED_COUNTER_NAME)) {
    // Not configured on this server — nobody has opted out (there's nowhere to store it)
    return false;
  }

  const value = await pluginData.state.counters.getCounterValue(PVP_CHALLENGES_DISABLED_COUNTER_NAME, null, userId);
  return value > 0;
}
