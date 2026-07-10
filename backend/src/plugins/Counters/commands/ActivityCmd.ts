import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";

export const ActivityCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["activity", "points"],
    permission: "can_view",

    signature: {
        user: ct.resolvedUser({ required: false }),
    },

    async run({ pluginData, message, args }) {
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

        const targetUser = args.user ?? message.author;

        const value = await pluginData.state.counters.getCurrentValue(counterId, null, targetUser.id);
        const finalValue = value ?? counter.initial_value ?? 0;

        if (targetUser.id === message.author.id) {
            message.channel.send(`You currently have **${finalValue}** activity points.`);
        } else {
            message.channel.send(`<@!${targetUser.id}> currently has **${finalValue}** activity points.`);
        }
    },
});