import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { env } from "../../../env.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

export const GiveawayDashboardCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: ["giveaway dashboard", "giveaways dashboard", "gw dashboard", "gw dash", "gw d"],
  permission: null,

  signature: {},

  async run({ pluginData, message }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const url = `${env.DASHBOARD_URL}/dashboard/guilds/${pluginData.guild.id}/config?mode=giveaways`;

    const embed = new EmbedBuilder()
      .setColor(getGuildEmbedColor(pluginData))
      .setTitle("Giveaways Dashboard")
      .setDescription("Manage giveaways for this server from the web dashboard.");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open Dashboard").setURL(url),
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  },
});
