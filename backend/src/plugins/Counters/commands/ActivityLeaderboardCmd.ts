import { guildPluginMessageCommand } from "vety";
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
import { MINUTES, noop } from "../../../utils.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";
const PER_PAGE = 10;
const PAGINATION_TIMEOUT = 2 * MINUTES;

const medals = ["🥇", "🥈", "🥉"];

export const ActivityLeaderboardCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["activity leaderboard", "activitytop", "activity top", "activity lb"],
    permission: "can_view",
    async run({ pluginData, message }) {
        const config = await pluginData.config.getForMessage(message);
        const counter = config.counters[ACTIVITY_COUNTER_NAME];
        const counterId = pluginData.state.counterIds[ACTIVITY_COUNTER_NAME];

        if (!counter || !counterId) {
            void pluginData.state.common.sendErrorMessage(
                message,
                `The "${ACTIVITY_COUNTER_NAME}" counter isn't configured on this server.`,
            );
            return;
        }

        const totalCount = await pluginData.state.counters.getValueCount(counterId);
        if (totalCount === 0) {
            message.channel.send("No activity data yet.");
            return;
        }

        const lastPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

        let leaderboardMsg: OmitPartialGroupDMChannel<Message> | null = null;
        let currentPage = 1;

        const buildEmbed = async (page: number) => {
            const offset = (page - 1) * PER_PAGE;
            const topValues = await pluginData.state.counters.getTopValues(counterId, PER_PAGE, offset);

            const lines = topValues.map((entry, i) => {
                const rank = offset + i;
                const label = medals[rank] ?? `**#${rank + 1}**`;
                return `${label} <@!${entry.user_id}> — **${entry.value}** points`;
            });

            return new EmbedBuilder()
                .setColor(0x0159b2)
                .setTitle("Activity Leaderboard")
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

            const idMod = `activityLb:${message.id}:${moment.utc().valueOf()}`;
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
