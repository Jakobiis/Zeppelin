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
import { MINUTES, noop } from "../../../utils.js";
import { formatAmount } from "../functions/formatAmount.js";
import { EconomyPluginType } from "../types.js";

const PER_PAGE = 10;
const PAGINATION_TIMEOUT = 2 * MINUTES;

const medals = ["🥇", "🥈", "🥉"];

export const LeaderboardCmd = guildPluginMessageCommand<EconomyPluginType>()({
    trigger: ["balance leaderboard", "balancetop", "balance top", "balance lb", "bal leaderboard", "baltop", "bal top", "bal lb"],
    permission: "can_view",

    async run({ pluginData, message }) {
        const config = pluginData.config.get();

        const totalCount = await pluginData.state.counters.getCounterValueCount(config.counter_name);
        if (totalCount === 0) {
            message.channel.send(`No ${config.currency_name} data yet.`);
            return;
        }

        const lastPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));
        const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";

        let leaderboardMsg: OmitPartialGroupDMChannel<Message> | null = null;
        let currentPage = 1;

        const buildEmbed = async (page: number) => {
            const offset = (page - 1) * PER_PAGE;
            const topValues = await pluginData.state.counters.getTopCounterValues(
                config.counter_name,
                PER_PAGE,
                offset,
            );

            const lines = topValues.map((entry, i) => {
                const rank = offset + i;
                const label = medals[rank] ?? `**#${rank + 1}**`;
                return `${label} <@!${entry.user_id}> — ${emojiPrefix}**${formatAmount(entry.value)}** ${config.currency_name}`;
            });

            return new EmbedBuilder()
                .setColor(0x0159b2)
                .setTitle(`${config.currency_name} Leaderboard`)
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

            const idMod = `economyLb:${message.id}:${moment.utc().valueOf()}`;
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
