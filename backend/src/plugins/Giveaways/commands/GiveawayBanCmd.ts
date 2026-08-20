import { Snowflake } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { banUserFromGiveaways } from "../functions/giveawayBans.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { GiveawaysPluginType } from "../types.js";

// Chat-command equivalent of the dashboard's "Giveaway ban" card (api/guilds/giveaways.ts's
// /giveaways/ban/:userId routes) — same enforcement (banUserFromGiveaways: blocks future entry, pulls them out
// of running giveaways, rerolls any unclaimed win), just using a live GuildMember for the optional ban_role_id
// grant here instead of a bot-token REST call.
export const GiveawayBanCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: ["giveaway ban", "gw ban", "gw b"],
  permission: null,

  signature: {
    user: ct.resolvedUser(),
    reason: ct.string({ required: false, catchAll: true }),
  },

  async run({ pluginData, message, args }) {
    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const result = await banUserFromGiveaways(pluginData.guild.id, args.user.id, args.reason?.trim() || null);

    const config = pluginData.config.get();
    if (config.ban_role_id) {
      const role = pluginData.guild.roles.cache.get(config.ban_role_id as Snowflake);
      const member = role ? await pluginData.guild.members.fetch(args.user.id).catch(() => null) : null;
      if (role && member) {
        await member.roles.add(role).catch(() => null);
      }
    }

    const details: string[] = [];
    if (result.removedFromRunning > 0) {
      details.push(`removed from ${result.removedFromRunning} running giveaway${result.removedFromRunning === 1 ? "" : "s"}`);
    }
    if (result.rerolledFromGiveawayIds.length > 0) {
      details.push(
        `rerolled out of ${result.rerolledFromGiveawayIds.length} unclaimed win${result.rerolledFromGiveawayIds.length === 1 ? "" : "s"} (#${result.rerolledFromGiveawayIds.join(", #")})`,
      );
    }

    void pluginData.state.common.sendSuccessMessage(
      message,
      `Banned <@${args.user.id}> from giveaways.${args.reason ? ` Reason: ${args.reason.trim()}` : ""}${details.length ? ` (${details.join("; ")})` : ""}`,
    );
  },
});
