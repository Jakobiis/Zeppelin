import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { finalizeGiveaway } from "../functions/finalizeGiveaway.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

export const GiveawayCancelCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: "giveaway cancel",
  // Not vety's usual permission system — see requireGiveawayManager.ts for why manager_roles is checked
  // manually inside run() instead.
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

    await finalizeGiveaway(giveaway.id, { cancelled: true });
    void pluginData.state.common.sendSuccessMessage(message, `Giveaway #${giveaway.id} cancelled.`);
  },
});
