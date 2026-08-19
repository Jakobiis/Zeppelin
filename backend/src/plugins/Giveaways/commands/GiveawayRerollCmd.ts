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

    const winnerIdsToReplace = giveaway.winner_ids
      .filter((winnerId) => !giveaway.expired_winner_ids.includes(winnerId))
      .slice(0, amount);
    const { giveaway: rerolled, newWinnerIds } = await rerollGiveaway(giveaway.id, winnerIdsToReplace);
    void pluginData.state.common.sendSuccessMessage(
      message,
      newWinnerIds.length > 0
        ? `Giveaway #${rerolled.id} rerolled. New winner(s): ${newWinnerIds.map((id) => `<@${id}>`).join(", ")}`
        : `Giveaway #${rerolled.id} has no more eligible entrants to reroll.`,
    );
  },
});
