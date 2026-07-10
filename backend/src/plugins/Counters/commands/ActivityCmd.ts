import { guildPluginMessageCommand } from "vety";
import { EmbedBuilder } from "discord.js";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";
const GRANT_TRIGGER_NAME = "grant_role";

function parseThreshold(condition?: string): number | null {
    if (!condition) return null;
    const match = condition.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
}

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

        const grantTrigger = counter.triggers?.[GRANT_TRIGGER_NAME];
        const requiredPoints = parseThreshold(grantTrigger?.condition);

        const who = targetUser.id === message.author.id ? "You currently have" : `<@!${targetUser.id}> currently has`;

        let text = `${who} **${finalValue}** activity points.`;
        if (requiredPoints !== null) {
            const remaining = requiredPoints - finalValue;
            text += remaining > 0
                ? `\n-# **${requiredPoints}** needed for the role — **${remaining}** to go`
                : `\n-# role requirement of **${requiredPoints}** met`;
        }


        const embed = new EmbedBuilder()
            .setColor(0x0159b2)
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setDescription(text);

        await message.channel.send({ embeds: [embed] });
    },
});