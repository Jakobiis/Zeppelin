import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  OmitPartialGroupDMChannel,
} from "discord.js";
import moment from "moment-timezone";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { MINUTES, noop } from "../../../utils.js";
import { getGuildEmbedColor } from "../../../utils/getGuildEmbedColor.js";
import { MESSAGE_PERIOD_ARG_HINT, MessagePeriod, parseMessagePeriod } from "../functions/messagePeriods.js";
import { MessageTrackerPluginType } from "../types.js";

const PER_PAGE = 10;
const PAGINATION_TIMEOUT = 2 * MINUTES;

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
    period: ct.string({ option: true }),
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

    const totalCount = await pluginData.state.counts.getTopCount(period);
    if (totalCount === 0) {
      void message.channel.send("No message data yet.");
      return;
    }

    const lastPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

    let leaderboardMsg: OmitPartialGroupDMChannel<Message> | null = null;
    let currentPage = 1;

    const buildEmbed = async (page: number) => {
      const offset = (page - 1) * PER_PAGE;
      const topValues = await pluginData.state.counts.getTop(period, PER_PAGE, offset);

      const lines = topValues.map((entry, i) => {
        const rank = offset + i;
        const label = medals[rank] ?? `**#${rank + 1}**`;
        return `${label} <@!${entry.userId}> — **${entry.count.toLocaleString()}** messages`;
      });

      return new EmbedBuilder()
        .setColor(getGuildEmbedColor(pluginData))
        .setTitle(PERIOD_TITLES[period])
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
