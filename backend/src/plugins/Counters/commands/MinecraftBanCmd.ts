import { guildPluginMessageCommand } from "vety";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { setCounterValue } from "../functions/setCounterValue.js";
import { CountersPluginType } from "../types.js";
import { MINECRAFT_ACCESS_BAN_COUNTER_NAME, MINECRAFT_ACCESS_ROLE_ID } from "./ActivityCmd.js";

export const MinecraftBanCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["minecraftban"],
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

        await setCounterValue(pluginData, MINECRAFT_ACCESS_BAN_COUNTER_NAME, null, args.user.id, 1);

        const member = await pluginData.guild.members.fetch(args.user.id).catch(() => null);

        let roleRemoved = false;
        if (member?.roles.cache.has(MINECRAFT_ACCESS_ROLE_ID)) {
            try {
                await member.roles.remove(
                    MINECRAFT_ACCESS_ROLE_ID,
                    `Minecraft access revoked via minecraftban by ${message.author.username}`,
                );
                roleRemoved = true;
            } catch {
                void pluginData.state.common.sendErrorMessage(
                    message,
                    `Marked <@!${args.user.id}> as banned from Minecraft access, but I couldn't remove their current role — a staff member may need to check my role permissions/hierarchy.`,
                );
                return;
            }
        }

        message.channel.send(
            `<@!${args.user.id}> is now banned from Minecraft access.${
                roleRemoved ? " Their current role has been removed." : ""
            }`,
        );
    },
});
