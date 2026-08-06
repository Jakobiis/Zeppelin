import { GuildPluginData } from "vety";
import { CountersPluginType } from "../types.js";

export async function getCounterValueCount(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
): Promise<number> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  const counterId = pluginData.state.counterIds[counterName];
  return pluginData.state.counters.getValueCount(counterId);
}
