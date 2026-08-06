import { guildPluginMessageCommand } from "vety";
import { buildEconomyInfoEmbed } from "../functions/buildEconomyInfoEmbed.js";
import { EconomyPluginType } from "../types.js";

export const EconomyHelpCmd = guildPluginMessageCommand<EconomyPluginType>()({
    trigger: ["economy help", "economyhelp", "economyinfo"],
    permission: "can_view",

    async run({ pluginData, message }) {
        const embed = buildEconomyInfoEmbed(pluginData);
        await message.channel.send({ embeds: [embed] });
    },
});
