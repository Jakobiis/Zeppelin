import { Snowflake } from "discord.js";
import { GuildPluginData } from "vety";
import { convertDelayStringToMS } from "../../../utils.js";
import { counterIdLock } from "../../../utils/lockNameHelpers.js";
import { CountersPluginType } from "../types.js";
import { checkAllValuesForReverseTrigger } from "./checkAllValuesForReverseTrigger.js";
import { checkAllValuesForTrigger } from "./checkAllValuesForTrigger.js";

export async function decayCounter(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
  decayPeriodMS: number,
  decayAmount: number,
) {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  const counterId = pluginData.state.counterIds[counterName];
  const lock = await pluginData.locks.acquire(counterIdLock(counterId));

  const roleOverrides = counter.decay?.role_overrides ?? [];
  const userIdsClaimedByOverrides: string[] = [];

  for (const override of roleOverrides) {
    const role = pluginData.guild.roles.cache.get(override.role as Snowflake);
    if (!role) {
      continue;
    }

    // First matching override in the list wins, so members already claimed by an earlier override are skipped here
    const overrideUserIds = [...role.members.keys()].filter((id) => !userIdsClaimedByOverrides.includes(id));
    if (overrideUserIds.length === 0) {
      continue;
    }

    userIdsClaimedByOverrides.push(...overrideUserIds);

    const overridePeriodMs = convertDelayStringToMS(override.every);
    if (!overridePeriodMs) {
      continue;
    }

    await pluginData.state.counters.decayForRole(
      counterId,
      override.role,
      overridePeriodMs,
      override.amount,
      overrideUserIds,
      counter.max_value,
    );
  }

  const amountOverrides = counter.decay?.amount_overrides ?? [];
  const allThresholds = amountOverrides.map((override) => override.threshold);

  for (const override of amountOverrides) {
    const overridePeriodMs = convertDelayStringToMS(override.every ?? counter.decay!.every);
    if (!overridePeriodMs) {
      continue;
    }

    await pluginData.state.counters.decayForAmountOverride(
      counterId,
      override.threshold,
      overridePeriodMs,
      override.amount,
      allThresholds,
      userIdsClaimedByOverrides,
      counter.max_value,
    );
  }

  // Rows in an amount_overrides bracket are decayed independently above, so exclude them from the base rate here
  const belowValue = allThresholds.length ? Math.min(...allThresholds) : undefined;

  await pluginData.state.counters.decay(
    counterId,
    decayPeriodMS,
    decayAmount,
    userIdsClaimedByOverrides,
    counter.max_value,
    belowValue,
  );

  // Check for trigger matches, if any, when the counter value changes
  const triggers = pluginData.state.counterTriggersByCounterId.get(counterId);
  if (triggers) {
    const triggersArr = Array.from(triggers.values());
    await Promise.all(triggersArr.map((trigger) => checkAllValuesForTrigger(pluginData, counterName, trigger)));
    await Promise.all(triggersArr.map((trigger) => checkAllValuesForReverseTrigger(pluginData, counterName, trigger)));
  }

  lock.unlock();
}
