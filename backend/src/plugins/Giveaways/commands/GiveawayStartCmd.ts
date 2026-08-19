import { Snowflake } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import moment from "moment-timezone";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { DBDateFormat } from "../../../utils.js";
import { registerUpcomingGiveaway } from "../../../data/loops/upcomingGiveawaysLoop.js";
import { buildGiveawayButtons, buildGiveawayEmbed } from "../functions/buildGiveawayMessage.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { resolveRoleList } from "../functions/resolveRoleList.js";
import { parseMessagePeriod } from "../../MessageTracker/functions/messagePeriods.js";
import { GiveawaysPluginType } from "../types.js";

const MAX_ROLES_PER_FLAG = 20;

export const GiveawayStartCmd = guildPluginMessageCommand<GiveawaysPluginType>()({
  trigger: ["giveaway start", "giveaway create"],
  permission: null,

  signature: {
    duration: ct.delay(),
    prize: ct.string({ catchAll: true }),

    winners: ct.number({ option: true, shortcut: "w" }),
    channel: ct.textChannel({ option: true, shortcut: "c" }),
    host: ct.resolvedUser({ option: true, shortcut: "h" }),
    role: ct.string({ option: true, shortcut: "r" }),
    bypass: ct.string({ option: true }),
    blacklist: ct.string({ option: true }),
    messages: ct.string({ option: true }),
    template: ct.string({ option: true, shortcut: "t" }),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();

    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    const template = args.template ? config.templates[args.template] : undefined;
    if (args.template && !template) {
      void pluginData.state.common.sendErrorMessage(message, `Unknown giveaway template \`${args.template}\``);
      return;
    }

    const templateChannel = template?.channel_id
      ? pluginData.guild.channels.cache.get(template.channel_id as Snowflake)
      : null;
    const channel = args.channel ?? templateChannel;
    if (!channel || !channel.isTextBased()) {
      void pluginData.state.common.sendErrorMessage(message, "You must specify a channel with `-channel`, or use a template that has one configured.");
      return;
    }

    const winnerCount = args.winners ?? 1;
    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
      void pluginData.state.common.sendErrorMessage(message, "Winner count must be a positive whole number.");
      return;
    }

    const hostId = args.host ? args.host.id : message.author.id;

    let requiredRoleIds: string[] = [];
    if (args.role) {
      const { roleIds, unresolved } = await resolveRoleList(pluginData.client, pluginData.guild.id, args.role);
      if (unresolved.length > 0) {
        void pluginData.state.common.sendErrorMessage(message, `Unknown role(s): ${unresolved.join(", ")}`);
        return;
      }
      requiredRoleIds = roleIds.slice(0, MAX_ROLES_PER_FLAG);
    }

    let bypassRoleIds = template?.bypass_roles ?? [];
    if (args.bypass) {
      const { roleIds, unresolved } = await resolveRoleList(pluginData.client, pluginData.guild.id, args.bypass);
      if (unresolved.length > 0) {
        void pluginData.state.common.sendErrorMessage(message, `Unknown bypass role(s): ${unresolved.join(", ")}`);
        return;
      }
      bypassRoleIds = roleIds.slice(0, MAX_ROLES_PER_FLAG);
    }

    let blacklistedRoleIds = template?.blacklisted_roles ?? [];
    if (args.blacklist) {
      const { roleIds, unresolved } = await resolveRoleList(pluginData.client, pluginData.guild.id, args.blacklist);
      if (unresolved.length > 0) {
        void pluginData.state.common.sendErrorMessage(message, `Unknown blacklist role(s): ${unresolved.join(", ")}`);
        return;
      }
      blacklistedRoleIds = roleIds.slice(0, MAX_ROLES_PER_FLAG);
    }

    let messageRequirement: { period: "daily" | "weekly" | "monthly" | "allTime"; count: number } | null = null;
    if (args.messages) {
      const [periodStr, countStr] = args.messages.split(":");
      const period = parseMessagePeriod(periodStr ?? "");
      const count = Number.parseInt(countStr ?? "", 10);
      if (!period || !Number.isInteger(count) || count < 1) {
        void pluginData.state.common.sendErrorMessage(message, "`-messages` must look like `total:1000` (period: daily/weekly/monthly/total, then a positive count).");
        return;
      }
      messageRequirement = { period, count };
    }

    const embedColor = template?.embed_color ?? undefined;
    const extraEntries = template?.extra_entries ?? {};

    const endsAt = moment.utc().add(args.duration, "ms").format(DBDateFormat);

    const giveaway = await pluginData.state.giveaways.create({
      channel_id: channel.id,
      message_id: null,
      host_id: hostId,
      prize: args.prize,
      winner_count: winnerCount,
      ends_at: endsAt,
      ended_at: null,
      status: "running",
      embed_color: embedColor ?? null,
      required_role_ids: requiredRoleIds,
      bypass_role_ids: bypassRoleIds,
      blacklisted_role_ids: blacklistedRoleIds,
      extra_entries: extraEntries,
      message_requirement: messageRequirement,
      winner_ids: [],
      created_at: moment.utc().format(DBDateFormat),
    });

    const sentMessage = await channel.send({
      embeds: [buildGiveawayEmbed(giveaway)],
      components: [buildGiveawayButtons(giveaway.id, 0)],
    });

    await pluginData.state.giveaways.update(giveaway.id, { message_id: sentMessage.id });
    registerUpcomingGiveaway({ ...giveaway, message_id: sentMessage.id });

    void pluginData.state.common.sendSuccessMessage(message, `Giveaway for **${args.prize}** started in <#${channel.id}>!`);
  },
});
