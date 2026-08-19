import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { rerollGiveaway } from "../functions/finalizeGiveaway.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

export const GiveawayRerollCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: "giveaway reroll",
  permission: null,

  signature: {
    messageId: ct.string(),
    amount: ct.number({ option: true, shortcut: "a" }),
  },

  async run({ pluginData, message, args }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const amount = args.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) {
      void pluginData.state.common.sendErrorMessage(message, "Amount must be a positive whole number.");
      return;
    }

    const giveaway = await pluginData.state.giveaways.findByMessageId(args.messageId);
    if (!giveaway) {
      void pluginData.state.common.sendErrorMessage(message, `No giveaway found for message ID \`${args.messageId}\``);
      return;
    }
    if (giveaway.status !== "ended") {
      void pluginData.state.common.sendErrorMessage(message, `Giveaway #${giveaway.id} hasn't ended yet, so it can't be rerolled.`);
      return;
    }

    const rerolled = await rerollGiveaway(giveaway.id, amount);
    const newWinners = rerolled.winner_ids.slice(giveaway.winner_ids.length);
    void pluginData.state.common.sendSuccessMessage(
      message,
      newWinners.length > 0
        ? `Giveaway #${rerolled.id} rerolled. New winner(s): ${newWinners.map((id) => `<@${id}>`).join(", ")}`
        : `Giveaway #${rerolled.id} has no more eligible entrants to reroll.`,
    );
  },
});
