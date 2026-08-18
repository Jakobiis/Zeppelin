import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  OmitPartialGroupDMChannel,
  Role,
  Snowflake,
} from "discord.js";
import moment from "moment-timezone";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { MINUTES, noop, resolveRoleId } from "../../../utils.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { refreshMembersIfNeeded } from "../../Utility/refreshMembers.js";
import { MESSAGE_PERIOD_ARG_HINT, MessagePeriod, parseMessagePeriod } from "../functions/messagePeriods.js";
import { MessageTrackerPluginType } from "../types.js";

const PER_PAGE = 10;
const PAGINATION_TIMEOUT = 2 * MINUTES;

// When filtering by role, there's no way to do the role check in SQL (role membership only exists on the live
// Discord guild, not in the DB), so instead we pull up to this many top-ranked rows and filter them in memory.
// Anyone ranked below this cutoff in the unfiltered leaderboard won't be considered, even if they have the role.
const ROLE_FILTER_SCAN_CAP = 2000;

const medals = ["🥇", "🥈", "🥉"];

const PERIOD_TITLES: Record<MessagePeriod, string> = {
  daily: "Today's Message Leaderboard",
  weekly: "This Week's Message Leaderboard",
  monthly: "This Month's Message Leaderboard",
  allTime: "All-Time Message Leaderboard",
};

export const MessagesLeaderboardCmd = guildPluginMessageCommand<MessageTrackerPluginType>()({
  trigger: ["messages leaderboard", "messages top", "messages lb", "m leaderboard", "m top", "m lb"],
  permission: "can_view",

  signature: {
    period: ct.string({ required: false }),
    channel: ct.textChannel({ option: true, required: false, shortcut: "c" }),
    // Plain string rather than ct.role() so a role *name* (e.g. `regular`) works too, not just a mention/ID —
    // pinging a role just to filter a leaderboard by it is undesirable, especially for owner/mod-only roles.
    role: ct.string({ option: true, required: false, shortcut: "r" }),
  },

  async run({ pluginData, message, args }) {
    let period: MessagePeriod = "allTime";
    if (args.period) {
      const parsed = parseMessagePeriod(args.period);
      if (!parsed) {
        void pluginData.state.common.sendErrorMessage(
          message,
          `Unknown period \`${args.period}\` — use ${MESSAGE_PERIOD_ARG_HINT} (default).`,
        );
        return;
      }
      period = parsed;
    }

    let role: Role | null = null;
    if (args.role) {
      const roleId = await resolveRoleId(pluginData.client, pluginData.guild.id, args.role);
      role = roleId ? (pluginData.guild.roles.cache.get(roleId as Snowflake) ?? null) : null;
      if (!role) {
        void pluginData.state.common.sendErrorMessage(message, `Unknown role \`${args.role}\``);
        return;
      }
    }

    // Per-channel counts only start accumulating once a message is sent after this feature shipped, so a
    // channel filter on an otherwise-active channel can still legitimately come back empty.
    const channelId = args.channel?.id ?? null;
    const source = channelId
      ? {
          getTop: (limit: number, offset: number) => pluginData.state.channelCounts.getTop(channelId, period, limit, offset),
          getTopCount: () => pluginData.state.channelCounts.getTopCount(channelId, period),
        }
      : {
          getTop: (limit: number, offset: number) => pluginData.state.counts.getTop(period, limit, offset),
          getTopCount: () => pluginData.state.counts.getTopCount(period),
        };

    // When filtering by role, we resolve the full (capped) filtered list up front and paginate over it in memory
    // rather than re-querying the DB per page, since the DB has no notion of role membership to offset/limit by.
    let entries: Array<{ userId: string; count: number }> | null = null;
    let totalCount: number;

    if (role) {
      await refreshMembersIfNeeded(pluginData.guild);
      const roleId = role.id;
      const candidateCount = await source.getTopCount();
      const candidates = await source.getTop(Math.min(candidateCount, ROLE_FILTER_SCAN_CAP), 0);
      entries = candidates.filter((entry) => pluginData.guild.members.cache.get(entry.userId)?.roles.cache.has(roleId));
      totalCount = entries.length;
    } else {
      totalCount = await source.getTopCount();
    }

    if (totalCount === 0) {
      void message.channel.send("No message data yet.");
      return;
    }

    const lastPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

    const title =
      PERIOD_TITLES[period] +
      (args.channel ? ` in #${args.channel.name}` : "") +
      (role ? ` (@${role.name} only)` : "");

    let leaderboardMsg: OmitPartialGroupDMChannel<Message> | null = null;
    let currentPage = 1;

    const buildEmbed = async (page: number) => {
      const offset = (page - 1) * PER_PAGE;
      const topValues = entries ? entries.slice(offset, offset + PER_PAGE) : await source.getTop(PER_PAGE, offset);

      const lines = topValues.map((entry, i) => {
        const rank = offset + i;
        const label = medals[rank] ?? `**#${rank + 1}**`;
        return `${label} <@!${entry.userId}> — **${entry.count.toLocaleString()}** messages`;
      });

      return new EmbedBuilder()
        .setColor(getGuildEmbedColor(pluginData))
        .setTitle(title)
        .setDescription(lines.join("\n"))
        .setFooter(lastPage > 1 ? { text: `Page ${page}/${lastPage}` } : null);
    };

    const loadPage = async (page: number) => {
      currentPage = page;
      const embed = await buildEmbed(page);

      if (lastPage === 1) {
        if (leaderboardMsg) {
          await leaderboardMsg.edit({ embeds: [embed], components: [] });
        } else {
          leaderboardMsg = await message.channel.send({ embeds: [embed] });
        }
        return;
      }

      const idMod = `messagesLb:${message.id}:${moment.utc().valueOf()}`;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅")
          .setCustomId(`previousButton:${idMod}`)
          .setDisabled(page === 1),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("➡")
          .setCustomId(`nextButton:${idMod}`)
          .setDisabled(page === lastPage),
      ]);

      if (leaderboardMsg) {
        await leaderboardMsg.edit({ embeds: [embed], components: [row] });
      } else {
        leaderboardMsg = await message.channel.send({ embeds: [embed], components: [row] });
      }

      const collector = leaderboardMsg.createMessageComponentCollector({ time: PAGINATION_TIMEOUT });

      collector.on("collect", async (interaction: MessageComponentInteraction) => {
        if (interaction.user.id !== message.author.id) {
          interaction
            .reply({ content: "You are not permitted to use these buttons.", ephemeral: true })
            .catch(noop);
          return;
        }

        if (interaction.customId === `previousButton:${idMod}` && currentPage > 1) {
          collector.stop();
          await interaction.deferUpdate();
          await loadPage(currentPage - 1);
        } else if (interaction.customId === `nextButton:${idMod}` && currentPage < lastPage) {
          collector.stop();
          await interaction.deferUpdate();
          await loadPage(currentPage + 1);
        } else {
          await interaction.deferUpdate();
        }
      });

      collector.on("end", (_collected, reason) => {
        if (reason === "stopped" || !leaderboardMsg) return;
        leaderboardMsg.edit({ components: [] }).catch(noop);
      });
    };

    await loadPage(currentPage);
  },
});
