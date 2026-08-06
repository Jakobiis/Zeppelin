import { GuildPluginData } from "vety";
import { CountersPluginType } from "../types.js";

export async function getCounterValue(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
  channelId: string | null,
  userId: string | null,
): Promise<number> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  channelId = counter.per_channel ? channelId : null;
  userId = counter.per_user ? userId : null;

  const counterId = pluginData.state.counterIds[counterName];
  const value = await pluginData.state.counters.getCurrentValue(counterId, channelId, userId);

  return value ?? counter.initial_value;
}
