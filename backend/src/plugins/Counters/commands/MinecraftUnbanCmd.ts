import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { parseCounterConditionString } from "../../../data/entities/CounterTrigger.js";
import { setCounterValue } from "../functions/setCounterValue.js";
import { CountersPluginType } from "../types.js";
import {
    ACTIVITY_COUNTER_NAME,
    MINECRAFT_ACCESS_BAN_COUNTER_NAME,
    MINECRAFT_ACCESS_ROLE_ID,
    MINECRAFT_ACCESS_TRIGGER_NAME,
    evaluateCondition,
} from "./ActivityCmd.js";

export const MinecraftUnbanCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["minecraftunban"],
    permission: "can_edit",

    signature: {
        user: ct.resolvedUser(),
    },

    async run({ pluginData, message, args }) {
        const banCounterId = pluginData.state.counterIds[MINECRAFT_ACCESS_BAN_COUNTER_NAME];
        if (!banCounterId) {
            void pluginData.state.common.sendErrorMessage(
                message,
                `The "${MINECRAFT_ACCESS_BAN_COUNTER_NAME}" counter isn't configured on this server.`,
            );
            return;
        }

        await setCounterValue(pluginData, MINECRAFT_ACCESS_BAN_COUNTER_NAME, null, args.user.id, 0);

        let statusText = `<@!${args.user.id}> is no longer banned from Minecraft access.`;

        const config = await pluginData.config.getForMessage(message);
        const counter = config.counters[ACTIVITY_COUNTER_NAME];
        const counterId = pluginData.state.counterIds[ACTIVITY_COUNTER_NAME];
        const grantTrigger = counter?.triggers?.[MINECRAFT_ACCESS_TRIGGER_NAME];
        const parsedGrant = grantTrigger ? parseCounterConditionString(grantTrigger.condition) : null;

        if (counter && counterId && parsedGrant && (parsedGrant[0] === ">" || parsedGrant[0] === ">=")) {
            const [grantOp, requiredPoints] = parsedGrant;
            const value = await pluginData.state.counters.getCurrentValue(counterId, null, args.user.id);
            const finalValue = value ?? counter.initial_value ?? 0;

            if (evaluateCondition(grantOp, requiredPoints, finalValue)) {
                const member = await pluginData.guild.members.fetch(args.user.id).catch(() => null);
                if (member && !member.roles.cache.has(MINECRAFT_ACCESS_ROLE_ID)) {
                    try {
                        await member.roles.add(
                            MINECRAFT_ACCESS_ROLE_ID,
                            `Minecraft access restored via minecraftunban by ${message.author.username}`,
                        );
                        statusText += " They still meet the point requirement, so their role has been restored.";
                    } catch {
                        statusText +=
                            " They still meet the point requirement, but I couldn't restore their role — a staff member may need to check my role permissions/hierarchy.";
                    }
                }
            }
        }

        message.channel.send(statusText);
    },
});
