import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { getColorInfoEmbed } from "../functions/getColorInfoEmbed.js";
import { utilityCmd } from "../types.js";

export const ColorCmd = utilityCmd({
  trigger: ["color", "colour"],
  description: "Show information about a color",
  permission: "can_color",

  signature: {
    color: ct.string({ required: true, catchAll: true }),
  },

  async run({ message, args, pluginData }) {
    const embed = getColorInfoEmbed(args.color.trim());
    if (!embed) {
      void pluginData.state.common.sendErrorMessage(message, "Invalid color");
      return;
    }

    message.channel.send({ embeds: [embed] });
  },
});
