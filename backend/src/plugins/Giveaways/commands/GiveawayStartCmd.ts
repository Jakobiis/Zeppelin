import { Snowflake } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { createGiveawayRecord } from "../functions/createGiveaway.js";
import { hasGiveawayManagerRole } from "../functions/requireGiveawayManager.js";
import { resolveRoleList } from "../functions/resolveRoleList.js";
import { parseMessagePeriod } from "../../MessageTracker/functions/messagePeriods.js";
import { parseCountRange } from "../functions/parseCountRange.js";
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
    holder: ct.resolvedUser({ option: true }),
    role: ct.string({ option: true, shortcut: "r" }),
    bypass: ct.string({ option: true }),
    blacklist: ct.string({ option: true }),
    messages: ct.string({ option: true }),
    template: ct.string({ option: true, shortcut: "t" }),
    claim: ct.string({ option: true }),
    activity: ct.string({ option: true }),
    coins: ct.string({ option: true }),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();

    if (!hasGiveawayManagerRole(pluginData, message.member!)) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have permission to manage giveaways.");
      return;
    }

    // A template named "default" is applied automatically when -template isn't given, so staff don't have to
    // spell it out on every giveaway — an explicit -template always wins over it.
    const template = args.template ? config.templates[args.template] : config.templates.default;
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
    const holderId = args.holder ? args.holder.id : null;

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

    let messageRequirement: { period: "daily" | "weekly" | "monthly" | "allTime"; min: number; max: number | null } | null = null;
    if (args.messages) {
      const [periodStr, rangeStr] = args.messages.split(":");
      const period = parseMessagePeriod(periodStr ?? "");
      const range = rangeStr ? parseCountRange(rangeStr) : null;
      if (!period || !range) {
        void pluginData.state.common.sendErrorMessage(message, "`-messages` must look like `total:1000` or `total:100-1000` (period, then a count or min-max range).");
        return;
      }
      messageRequirement = { period, ...range };
    }

    let claimTimeMs: number | null = null;
    if (args.claim) {
      claimTimeMs = convertDelayStringToMS(args.claim);
      if (!claimTimeMs || claimTimeMs <= 0) {
        void pluginData.state.common.sendErrorMessage(message, "`-claim` must be a valid duration, e.g. `1d` or `12h`.");
        return;
      }
    } else if (template?.claim_time) {
      claimTimeMs = convertDelayStringToMS(template.claim_time);
    }

    let counterRequirement: { counter_name: string; min: number; max: number | null } | null = null;
    if (args.activity) {
      const range = parseCountRange(args.activity);
      if (!range) {
        void pluginData.state.common.sendErrorMessage(message, "`-activity` must be a count or min-max range, e.g. `100` or `100-1000`.");
        return;
      }
      counterRequirement = { counter_name: config.activity_counter_name, ...range };
    }

    let coinsRequirement: { min: number; max: number | null } | null = null;
    if (args.coins) {
      const range = parseCountRange(args.coins);
      if (!range) {
        void pluginData.state.common.sendErrorMessage(message, "`-coins` must be a count or min-max range, e.g. `100` or `100-1000`.");
        return;
      }
      coinsRequirement = range;
    }

    const giveaway = await createGiveawayRecord(pluginData.guild.id, {
      channel_id: channel.id,
      host_id: hostId,
      holder_id: holderId,
      prize: args.prize,
      winner_count: winnerCount,
      duration_ms: args.duration,
      embed_color: template?.embed_color ?? null,
      required_role_ids: requiredRoleIds,
      bypass_role_ids: bypassRoleIds,
      blacklisted_role_ids: blacklistedRoleIds,
      extra_entries: template?.extra_entries ?? {},
      message_requirement: messageRequirement,
      counter_requirement: counterRequirement,
      coins_requirement: coinsRequirement,
      claim_time_ms: claimTimeMs,
    });

    void pluginData.state.common.sendSuccessMessage(message, `Giveaway #${giveaway.id} for **${args.prize}** started in <#${channel.id}>!`);
  },
});
