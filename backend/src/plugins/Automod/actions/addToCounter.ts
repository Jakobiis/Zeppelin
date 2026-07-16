import { z } from "zod";
import { zBoundedCharacters } from "../../../utils.js";
import { CountersPlugin } from "../../Counters/CountersPlugin.js";
import { LogsPlugin } from "../../Logs/LogsPlugin.js";
import { SchedulePlugin } from "../../Schedule/SchedulePlugin.js";
import { automodAction } from "../helpers.js";

const configSchema = z.object({
  counter: zBoundedCharacters(0, 100),
  amount: z.number(),
  schedules: z.array(zBoundedCharacters(0, 100)).max(10).optional(),
});

export const AddToCounterAction = automodAction({
  configSchema,

  async apply({ pluginData, contexts, actionConfig, ruleName }) {
    const countersPlugin = pluginData.getPlugin(CountersPlugin);
    if (!countersPlugin.counterExists(actionConfig.counter)) {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Unknown counter \`${actionConfig.counter}\` in \`add_to_counter\` action of Automod rule \`${ruleName}\``,
      });
      return;
    }

    let amount = actionConfig.amount;
    if (actionConfig.schedules?.length) {
      const schedulePlugin = pluginData.getPlugin(SchedulePlugin);
      for (const scheduleName of actionConfig.schedules) {
        if (!schedulePlugin.scheduleExists(scheduleName)) {
          pluginData.getPlugin(LogsPlugin).logBotAlert({
            body: `Unknown schedule \`${scheduleName}\` in \`add_to_counter\` action of Automod rule \`${ruleName}\``,
          });
          continue;
        }
        amount *= schedulePlugin.getMultiplier(scheduleName);
      }
    }

    countersPlugin.changeCounterValue(
      actionConfig.counter,
      contexts[0].message?.channel_id || null,
      contexts[0].user?.id || null,
      amount,
    );
  },
});
