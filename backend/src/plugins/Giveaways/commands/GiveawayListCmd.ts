import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { currentWinnerIds } from "../functions/buildGiveawayMessage.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

const RECENT_FINISHED_LIMIT = 10;
const giveawayEntries = new GiveawayEntries();

export const GiveawayListCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: "giveaway list",
  permission: null,
  signature: {},

  async run({ pluginData, message }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const running = await pluginData.state.giveaways.getRunning();
    const recentlyFinished = await pluginData.state.giveaways.getRecentlyFinished(RECENT_FINISHED_LIMIT);

    if (running.length === 0 && recentlyFinished.length === 0) {
      void message.channel.send("No giveaways yet.");
      return;
    }

    const runningLines = await Promise.all(
      running.map(async (g) => {
        const count = await giveawayEntries.count(g.id);
        return `**#${g.id}** ${g.prize} — <#${g.channel_id}> — ${count} entries`;
      }),
    );

    const finishedLines = recentlyFinished.map((g) => {
      const status = g.status === "cancelled" ? "cancelled" : `won by ${currentWinnerIds(g).map((id) => `<@${id}>`).join(", ") || "nobody"}`;
      return `**#${g.id}** ${g.prize} — ${status}`;
    });

    const embed = new EmbedBuilder().setColor(getGuildEmbedColor(pluginData)).setTitle("Giveaways");
    if (runningLines.length > 0) {
      embed.addFields({ name: "Running", value: runningLines.join("\n") });
    }
    if (finishedLines.length > 0) {
      embed.addFields({ name: "Recently finished", value: finishedLines.join("\n") });
    }

    await message.channel.send({ embeds: [embed] });
  },
});
