import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { finalizeGiveaway } from "../functions/finalizeGiveaway.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

export const GiveawayEndCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: "giveaway end",
  permission: null,

  signature: {
    id: ct.number(),
  },

  async run({ pluginData, message, args }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const giveaway = await pluginData.state.giveaways.find(args.id);
    if (!giveaway) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown giveaway #${args.id}`);
      return;
    }
    if (giveaway.status !== "running") {
      void pluginData.state.common.sendErrorMessage(message, `Giveaway #${args.id} isn't running.`);
      return;
    }

    const ended = await finalizeGiveaway(giveaway.id, { cancelled: false });
    void pluginData.state.common.sendSuccessMessage(
      message,
      ended.winner_ids.length > 0
        ? `Giveaway #${ended.id} ended. Winner(s): ${ended.winner_ids.map((id) => `<@${id}>`).join(", ")}`
        : `Giveaway #${ended.id} ended with no eligible entries.`,
    );
  },
});
