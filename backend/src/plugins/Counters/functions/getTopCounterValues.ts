import { GuildPluginData } from "vety";
import { CounterValue } from "../../../data/entities/CounterValue.js";
import { CountersPluginType } from "../types.js";

export async function getTopCounterValues(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
  limit = 10,
  offset = 0,
): Promise<CounterValue[]> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  const counterId = pluginData.state.counterIds[counterName];
  return pluginData.state.counters.getTopValues(counterId, limit, offset);
}
