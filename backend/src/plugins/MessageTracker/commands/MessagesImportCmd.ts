import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { MINUTES, renderUsername } from "../../../utils.js";
import { MessageTrackerPluginType } from "../types.js";

const IMPORT_TIMEOUT = 2 * MINUTES;

// Tolerates both plausible ways this could get pasted: "Today: 41" on one line, or an embed field's name and
// value copied as two separate lines ("Today" then "41") — Discord's client does the latter when you copy an
// embed field's text.
function extractCount(text: string, label: string): number | null {
  const re = new RegExp(`${label}\\s*:?\\s*\\n?\\s*([\\d,]+)`, "i");
  const match = re.exec(text);
  if (!match) return null;
  const n = parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export const MessagesImportCmd = guildPluginMessageCommand<MessageTrackerPluginType>()({
  trigger: ["messages import", "m import"],
  permission: "can_import",

  signature: {
    member: ct.resolvedMember({ required: false }),
  },

  async run({ pluginData, message, args }) {
    const target = args.member || message.member;

    await pluginData.state.common.sendSuccessMessage(
      message,
      `Paste the message stats to import for **${renderUsername(target)}** (e.g. copied from another bot's stats embed) within 2 minutes.`,
    );

    const collected = await message.channel
      .awaitMessages({
        filter: (m) => m.author.id === message.author.id,
        max: 1,
        time: IMPORT_TIMEOUT,
        errors: ["time"],
      })
      .catch(() => null);

    if (!collected || collected.size === 0) {
      void pluginData.state.common.sendErrorMessage(message, "Timed out waiting for the stats to import.");
      return;
    }

    const text = collected.first()!.content;

    const daily = extractCount(text, "Today");
    const weekly = extractCount(text, "This Week");
    const monthly = extractCount(text, "This Month");
    const allTime = extractCount(text, "Total") ?? extractCount(text, "All Time");

    if (daily == null || weekly == null || monthly == null || allTime == null) {
      void pluginData.state.common.sendErrorMessage(
        message,
        "Couldn't find all four counts (Today/This Week/This Month/Total or All Time) in that message — import cancelled.",
      );
      return;
    }

    await pluginData.state.counts.setCount(target.id, "daily", daily);
    await pluginData.state.counts.setCount(target.id, "weekly", weekly);
    await pluginData.state.counts.setCount(target.id, "monthly", monthly);
    await pluginData.state.counts.setCount(target.id, "allTime", allTime);

    void pluginData.state.common.sendSuccessMessage(
      message,
      `Imported message stats for **${renderUsername(target)}**:\n` +
        `Today: **${daily.toLocaleString()}**\n` +
        `This Week: **${weekly.toLocaleString()}**\n` +
        `This Month: **${monthly.toLocaleString()}**\n` +
        `All Time: **${allTime.toLocaleString()}**`,
    );
  },
});
