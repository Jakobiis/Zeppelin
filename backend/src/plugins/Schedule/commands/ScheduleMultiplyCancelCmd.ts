import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { cancelScheduledMultiplier } from "../functions/cancelScheduledMultiplier.js";
import { scheduleCmd } from "../types.js";

export const ScheduleMultiplyCancelCmd = scheduleCmd({
  trigger: ["multiplier cancel", "boost cancel"],
  usage: "!multiplier cancel hourly_boost",
  permission: "can_multiply",

  signature: {
    name: ct.string(),
  },

  async run({ message, args, pluginData }) {
    const config = await pluginData.config.getForMessage(message);

    if (!(args.name in config.multipliers)) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown schedule \`${args.name}\`.`);
      return;
    }

    const result = await cancelScheduledMultiplier(pluginData, args.name);

    if (result.ok) {
      const entry = config.multipliers[args.name];
      void pluginData.state.common.sendSuccessMessage(
        message,
        `**${entry.pretty_name ?? args.name}** has been cancelled.`,
      );
      return;
    }

    if (result.reason === "wrong_type") {
      void pluginData.state.common.sendErrorMessage(
        message,
        `\`${args.name}\` isn't configured with a \`duration\` and can't be cancelled this way.`,
      );
      return;
    }

    if (result.reason === "not_active") {
      void pluginData.state.common.sendErrorMessage(message, `\`${args.name}\` isn't currently active.`);
      return;
    }

    void pluginData.state.common.sendErrorMessage(message, `Unknown schedule \`${args.name}\`.`);
  },
});
