import { Snowflake } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { unbanUserFromGiveaways } from "../functions/giveawayBans.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

export const GiveawayUnbanCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: ["giveaway unban", "gw unban", "gw ub"],
  permission: null,

  signature: {
    user: ct.resolvedUser(),
  },

  async run({ pluginData, message, args }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    await unbanUserFromGiveaways(pluginData.guild.id, args.user.id);

    const config = pluginData.config.get();
    if (config.ban_role_id) {
      const role = pluginData.guild.roles.cache.get(config.ban_role_id as Snowflake);
      const member = role ? await pluginData.guild.members.fetch(args.user.id).catch(() => null) : null;
      if (role && member) {
        await member.roles.remove(role).catch(() => null);
      }
    }

    void pluginData.state.common.sendSuccessMessage(message, `Unbanned <@${args.user.id}> from giveaways.`);
  },
});
