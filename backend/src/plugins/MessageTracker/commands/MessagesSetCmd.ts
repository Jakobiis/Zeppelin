import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { renderUsername } from "../../../utils.js";
import { MESSAGE_PERIOD_ARG_HINT, parseMessagePeriod } from "../functions/messagePeriods.js";
import { MessageTrackerPluginType } from "../types.js";

const PERIOD_LABELS = {
  daily: "today's",
  weekly: "this week's",
  monthly: "this month's",
  allTime: "all-time",
};

export const MessagesSetCmd = guildPluginMessageCommand<MessageTrackerPluginType>()({
  trigger: ["messages set", "m set"],
  permission: "can_manage",

  signature: {
    member: ct.resolvedMember(),
    period: ct.string(),
    amount: ct.number(),
  },

  async run({ pluginData, message, args }) {
    const period = parseMessagePeriod(args.period);
    if (!period) {
      void pluginData.state.common.sendErrorMessage(
        message,
        `Unknown period \`${args.period}\` — use ${MESSAGE_PERIOD_ARG_HINT}.`,
      );
      return;
    }

    if (!Number.isFinite(args.amount) || args.amount < 0) {
      void pluginData.state.common.sendErrorMessage(message, "Amount must be a positive whole number (or 0).");
      return;
    }

    const amount = Math.round(args.amount);
    await pluginData.state.counts.setCount(args.member.id, period, amount);

    void pluginData.state.common.sendSuccessMessage(
      message,
      `Set **${renderUsername(args.member)}**'s ${PERIOD_LABELS[period]} message count to **${amount.toLocaleString()}**.`,
    );
  },
});
