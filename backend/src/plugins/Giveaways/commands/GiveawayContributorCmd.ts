import { Snowflake } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

// Chat-command equivalent of the dashboard's "Giveaway contributor" card (api/guilds/giveaways.ts's
// /giveaways/contributor/:userId routes) — same config field (contributor_role_id), same manager_roles gate,
// just using a live GuildMember here instead of a bot-token REST call.
export const GiveawayContributorCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: ["giveaway contributor", "gw con", "gw c"],
  permission: null,

  signature: {
    user: ct.resolvedUser(),
    action: ct.string(),
  },

  async run({ pluginData, message, args }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const action = args.action.toLowerCase();
    if (action !== "grant" && action !== "revoke") {
      void pluginData.state.common.sendErrorMessage(message, "Specify `grant` or `revoke`, e.g. `-giveaway contributor @user grant`");
      return;
    }

    const config = pluginData.config.get();
    if (!config.contributor_role_id) {
      void pluginData.state.common.sendErrorMessage(
        message,
        "No contributor role is configured — set `contributor_role_id` in this plugin's config first.",
      );
      return;
    }

    const role = pluginData.guild.roles.cache.get(config.contributor_role_id as Snowflake);
    if (!role) {
      void pluginData.state.common.sendErrorMessage(message, "The configured contributor role no longer exists.");
      return;
    }

    const member = await pluginData.guild.members.fetch(args.user.id).catch(() => null);
    if (!member) {
      void pluginData.state.common.sendErrorMessage(message, "That user isn't in this server.");
      return;
    }

    try {
      if (action === "grant") {
        await member.roles.add(role);
      } else {
        await member.roles.remove(role);
      }
    } catch {
      void pluginData.state.common.sendErrorMessage(
        message,
        "Couldn't update that role — check the bot's permissions and that its own role is above the contributor role.",
      );
      return;
    }

    void pluginData.state.common.sendSuccessMessage(
      message,
      `${action === "grant" ? "Granted" : "Revoked"} the contributor role ${action === "grant" ? "to" : "from"} <@${member.id}>.`,
    );
  },
});
