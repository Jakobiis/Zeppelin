import { guildPluginMessageCommand } from "vety";
import { EmbedBuilder } from "discord.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";
const LEADERBOARD_SIZE = 10;

const medals = ["🥇", "🥈", "🥉"];

export const ActivityLeaderboardCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["activity leaderboard", "activitytop"],
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

        const topValues = await pluginData.state.counters.getTopValues(counterId, LEADERBOARD_SIZE);

        if (topValues.length === 0) {
            message.channel.send("No activity data yet.");
            return;
        }

        const lines = topValues.map((entry, i) => {
            const rank = medals[i] ?? `**#${i + 1}**`;
            return `${rank} <@!${entry.user_id}> — **${entry.value}** points`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x0159b2)
            .setTitle("Activity Leaderboard")
            .setDescription(lines.join("\n"));

        await message.channel.send({ embeds: [embed] });
    },
});