import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageComponentInteraction, OmitPartialGroupDMChannel, Message } from "discord.js";
import moment from "moment-timezone";
import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { MINUTES, noop } from "../../../utils.js";
import { findGameEntry } from "../functions/findGame.js";
import { formatAmount } from "../functions/formatAmount.js";
import { EconomyPluginType } from "../types.js";

const PER_PAGE = 10;
const PAGINATION_TIMEOUT = 2 * MINUTES;

const OUTCOME_EMOJI: Record<string, string> = {
  win: "🏆",
  loss: "💀",
  push: "🤝",
};

/**
 * Staff-only audit tool: lets a mod look up a user's game-by-game history (bet, outcome, net change, balance
 * after) so that if a game turns out to have been exploited, they have a concrete record to work from when
 * deciding how much to claw back rather than having to guess.
 */
export const GameHistoryCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["gamehistory", "gamehist"],
  permission: "can_manage",

  signature: {
    user: ct.resolvedUser(),

    game: ct.string({ option: true }),
    timeframe: ct.delay({ option: true }),
    page: ct.number({ option: true }),
  },

  async run({ pluginData, message, args }) {
    const config = pluginData.config.get();

    // Resolves an alias to the canonical game name (the key game history is actually logged under) so filtering
    // by an alias finds the same entries filtering by the real name would.
    let gameName: string | null = null;
    if (args.game) {
      const entry = findGameEntry(config.games, args.game);
      if (!entry) {
        void pluginData.state.common.sendErrorMessage(message, `No game configured with the name \`${args.game}\``);
        return;
      }
      gameName = entry[0];
    }

    const targetUser = args.user;
    const filter = {
      userId: targetUser.id,
      gameName,
      since: args.timeframe ? new Date(Date.now() - args.timeframe) : null,
    };

    const totalCount = await pluginData.state.gameHistory.getCount(filter);
    if (totalCount === 0) {
      void message.channel.send(
        `No game history found for **${targetUser.username}**${gameName ? ` in \`${gameName}\`` : ""}${
          args.timeframe ? ` in the last ${humanizeDuration(args.timeframe)}` : ""
        }.`,
      );
      return;
    }

    const summary = await pluginData.state.gameHistory.getSummary(filter);
    const lastPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

    const filterText = `Filters: ${gameName ? `\`${gameName}\`` : "all games"} · ${
      args.timeframe ? `last ${humanizeDuration(args.timeframe)}` : "all time"
    }`;

    const netSign = summary.net >= 0 ? "+" : "-";
    const summaryText =
      `**${summary.totalEntries}** games — Net: ${netSign}${emojiPrefix}**${formatAmount(Math.abs(summary.net))}** ` +
      `(Won ${emojiPrefix}**${formatAmount(summary.totalWon)}**, Lost ${emojiPrefix}**${formatAmount(Math.abs(summary.totalLost))}**)`;

    let historyMsg: OmitPartialGroupDMChannel<Message> | null = null;
    let currentPage = 1;

    const buildEmbed = async (page: number): Promise<EmbedBuilder> => {
      const offset = (page - 1) * PER_PAGE;
      const entries = await pluginData.state.gameHistory.getEntries(filter, PER_PAGE, offset);

      const lines = entries.map((entry) => {
        const ts = moment.utc(entry.created_at).unix();
        const emoji = OUTCOME_EMOJI[entry.outcome] ?? "";
        const sign = entry.amount_changed > 0 ? "+" : entry.amount_changed < 0 ? "-" : "";
        const opponentText = !entry.opponent_id
          ? ""
          : entry.opponent_id === "bot"
            ? " vs Bot"
            : ` vs <@${entry.opponent_id}>`;

        return (
          `<t:${ts}:R> ${emoji} **${entry.game_name}**${opponentText} — bet ${emojiPrefix}${formatAmount(entry.bet_amount)}, ` +
          `net ${sign}${emojiPrefix}${formatAmount(Math.abs(entry.amount_changed))}, balance ${emojiPrefix}${formatAmount(entry.balance_after)}`
        );
      });

      return new EmbedBuilder()
        .setColor(0x0159b2)
        .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
        .setTitle("Game History")
        .setDescription(`${filterText}\n${summaryText}\n\n${lines.join("\n")}`)
        .setFooter({ text: `Page ${page}/${lastPage}` });
    };

    const loadPage = async (page: number): Promise<void> => {
      currentPage = page;
      const embed = await buildEmbed(page);

      if (lastPage === 1) {
        if (historyMsg) {
          await historyMsg.edit({ embeds: [embed], components: [] });
        } else {
          historyMsg = await message.channel.send({ embeds: [embed] });
        }
        return;
      }

      const idMod = `economyGameHistory:${message.id}:${moment.utc().valueOf()}`;
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

      if (historyMsg) {
        await historyMsg.edit({ embeds: [embed], components: [row] });
      } else {
        historyMsg = await message.channel.send({ embeds: [embed], components: [row] });
      }

      const collector = historyMsg.createMessageComponentCollector({ time: PAGINATION_TIMEOUT });

      collector.on("collect", async (interaction: MessageComponentInteraction) => {
        if (interaction.user.id !== message.author.id) {
          await interaction
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
        if (reason === "stopped" || !historyMsg) return;
        historyMsg.edit({ components: [] }).catch(noop);
      });
    };

    const requestedPage = args.page ? Math.min(Math.max(1, Math.floor(args.page)), lastPage) : 1;
    await loadPage(requestedPage);
  },
});
