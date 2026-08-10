import { Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { EconomyPluginType } from "../types.js";
import { formatAmount } from "./formatAmount.js";

// The Automod rule that feeds the coins counter — there's no formal link between the two, this is just this
// server's naming convention (mirrors how the `activity` counter is fed by `accumulate_activity`, see
// backend/src/plugins/Counters/commands/ActivityCmd.ts).
const COINS_AUTOMOD_RULE_NAME = "accumulate_coins";

/**
 * Describes the passive, per-message way people earn coins (via an Automod add_to_counter rule), so the economy
 * help embed can explain where "randomly" earned coins are coming from instead of only covering games/trading.
 * Returns an empty array if there's no such rule (or Automod/Schedule aren't available) — the caller just omits
 * the section in that case.
 */
export async function buildCoinsSourceLines(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
): Promise<string[]> {
  try {
    const { AutomodPlugin } = await import("../../Automod/AutomodPlugin.js");
    if (!pluginData.hasPlugin(AutomodPlugin)) {
      return [];
    }

    const config = pluginData.config.get();
    const automod = pluginData.getPlugin(AutomodPlugin);
    const rule = await automod.getRuleConfigForMessage(COINS_AUTOMOD_RULE_NAME, message);
    const addToCounter = rule?.actions?.add_to_counter;

    if (!rule || !rule.enabled || !addToCounter || addToCounter.counter !== config.counter_name) {
      return [];
    }

    const lines = [`+**${formatAmount(addToCounter.amount)}** ${config.currency_name} per qualifying message`];

    if (rule.cooldown) {
      const cooldownMs = convertDelayStringToMS(rule.cooldown);
      if (cooldownMs) {
        lines.push(`Cooldown: ${humanizeDuration(cooldownMs)} between messages that count`);
      }
    }

    if (addToCounter.schedules?.length) {
      const { SchedulePlugin } = await import("../../Schedule/SchedulePlugin.js");
      if (pluginData.hasPlugin(SchedulePlugin)) {
        const schedulePlugin = pluginData.getPlugin(SchedulePlugin);
        let totalMultiplier = 1;
        let anyActive = false;
        for (const scheduleName of addToCounter.schedules) {
          const info = schedulePlugin.getScheduleInfo(scheduleName);
          if (info?.active) {
            totalMultiplier *= info.multiplier;
            anyActive = true;
          }
        }
        if (anyActive) {
          lines.push(
            `Boosted right now: **${formatAmount(addToCounter.amount * totalMultiplier)}** ${config.currency_name} per message`,
          );
        }
      }
    }

    return lines;
  } catch {
    return [];
  }
}
