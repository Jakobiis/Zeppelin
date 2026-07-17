import { guildPluginMessageCommand } from "vety";
import { buildActivityInfoEmbed } from "./ActivityCmd.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";

export const ActivityHelpCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["activity help", "activityhelp", "activityinfo"],
    permission: "can_view",
    async run({ pluginData, message }) {
        const config = await pluginData.config.getForMessage(message);
        const counter = config.counters[ACTIVITY_COUNTER_NAME];

        if (!counter) {
            void pluginData.state.common.sendErrorMessage(
                message,
                `The "${ACTIVITY_COUNTER_NAME}" counter isn't configured on this server.`,
            );
            return;
        }

        const embed = await buildActivityInfoEmbed(pluginData, message, counter);
        await message.channel.send({ embeds: [embed] });
    },
});
