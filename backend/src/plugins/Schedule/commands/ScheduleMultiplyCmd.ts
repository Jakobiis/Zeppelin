import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { triggerScheduledMultiplier } from "../functions/triggerScheduledMultiplier.js";
import { scheduleCmd } from "../types.js";

export const ScheduleMultiplyCmd = scheduleCmd({
  trigger: ["multiplier", "boost"],
  usage: "!multiplier hourly_boost",
  permission: "can_multiply",

  signature: {
    name: ct.string(),
  },

  async run({ message, args, pluginData }) {
    const config = await pluginData.config.getForMessage(message);

    const triggerableNames = Object.entries(config.multipliers)
      .filter(([, entry]) => entry.duration != null)
      .map(([name]) => name);

    if (!(args.name in config.multipliers)) {
      void pluginData.state.common.sendErrorMessage(
        message,
        triggerableNames.length
          ? `Unknown schedule \`${args.name}\`. Triggerable schedules: ${triggerableNames.map((n) => `\`${n}\``).join(", ")}`
          : `Unknown schedule \`${args.name}\`, and no schedules are configured with a \`duration\` to trigger.`,
      );
      return;
    }

    const result = await triggerScheduledMultiplier(pluginData, args.name);

    if (result.ok) {
      const entry = config.multipliers[args.name];
      const durationMs = pluginData.state.runtimeStates.get(args.name)?.lastDurationMs ?? 0;
      void pluginData.state.common.sendSuccessMessage(
        message,
        `**${entry.pretty_name ?? args.name}** (${entry.multiplier}x) is now active for ${humanizeDuration(durationMs, { round: true })}.`,
      );
      return;
    }

    if (result.reason === "wrong_type") {
      void pluginData.state.common.sendErrorMessage(
        message,
        triggerableNames.length
          ? `\`${args.name}\` isn't configured with a \`duration\` and can't be triggered manually. Triggerable schedules: ${triggerableNames
              .map((n) => `\`${n}\``)
              .join(", ")}`
          : `\`${args.name}\` isn't configured with a \`duration\` and can't be triggered manually, and no schedules are configured with a \`duration\` to trigger.`,
      );
      return;
    }

    if (result.reason === "already_active") {
      void pluginData.state.common.sendErrorMessage(message, `\`${args.name}\` is already active.`);
      return;
    }

    void pluginData.state.common.sendErrorMessage(message, `Unknown schedule \`${args.name}\`.`);
  },
});
