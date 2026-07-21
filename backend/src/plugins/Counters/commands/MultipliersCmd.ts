import { guildPluginMessageCommand } from "vety";
import { EmbedBuilder } from "discord.js";
import { CountersPluginType } from "../types.js";
import { buildEarningInfoLines } from "./ActivityCmd.js";

export const MultipliersCmd = guildPluginMessageCommand<CountersPluginType>()({
  trigger: ["multipliers", "boosts"],
  permission: "can_view",

  signature: {},

  async run({ pluginData, message }) {
    const { SchedulePlugin } = await import("../../Schedule/SchedulePlugin.js");
    if (!pluginData.hasPlugin(SchedulePlugin)) {
      void pluginData.state.common.sendErrorMessage(message, "No multipliers/boosts are configured on this server.");
      return;
    }

    const schedulePlugin = pluginData.getPlugin(SchedulePlugin);
    const schedules = schedulePlugin.listSchedules();

    if (!schedules.length) {
      void pluginData.state.common.sendErrorMessage(message, "No multipliers/boosts are configured on this server.");
      return;
    }

    const scheduleLines = schedules.map((schedule) => {
      const label = schedule.prettyName ?? schedule.name;
      if (schedule.active) {
        const untilText = schedule.activeUntil ? ` (ends <t:${Math.floor(schedule.activeUntil / 1000)}:R>)` : "";
        return `🟢 **${label}** (${schedule.multiplier}x) — active${untilText}`;
      }
      return `⚪ **${label}** (${schedule.multiplier}x) — inactive`;
    });

    const sections = [scheduleLines.join("\n")];

    const { earningLines } = await buildEarningInfoLines(pluginData, message);
    if (earningLines.length) {
      sections.push(`**Right now**\n${earningLines.join("\n")}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x0159b2)
      .setTitle("Multipliers & Boosts")
      .setDescription(sections.join("\n\n"));

    await message.channel.send({ embeds: [embed] });
  },
});
