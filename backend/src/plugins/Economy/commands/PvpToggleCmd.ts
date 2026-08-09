import { guildPluginMessageCommand } from "vety";
import { PVP_CHALLENGES_DISABLED_COUNTER_NAME, isPvpDisabled } from "../functions/pvpToggle.js";
import { EconomyPluginType } from "../types.js";

export const PvpToggleCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["pvp", "pvptoggle", "challenges"],
  permission: "can_view",

  signature: {},

  async run({ pluginData, message }) {
    if (!pluginData.state.counters.counterExists(PVP_CHALLENGES_DISABLED_COUNTER_NAME)) {
      void pluginData.state.common.sendErrorMessage(
        message,
        `The "${PVP_CHALLENGES_DISABLED_COUNTER_NAME}" counter isn't configured on this server.`,
      );
      return;
    }

    const currentlyDisabled = await isPvpDisabled(pluginData, message.author.id);
    const newValue = currentlyDisabled ? 0 : 1;

    await pluginData.state.counters.setCounterValue(PVP_CHALLENGES_DISABLED_COUNTER_NAME, null, message.author.id, newValue);

    message.channel.send(
      newValue === 1
        ? "You will no longer receive PvP challenge requests."
        : "You will now receive PvP challenge requests again.",
    );
  },
});
