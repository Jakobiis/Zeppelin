import { EmbedBuilder } from "discord.js";
import { GuildPluginData } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { EconomyPluginType } from "../types.js";
import { formatRewardAmount, formatWinMultiplier } from "./numberOrRange.js";

export function buildEconomyInfoEmbed(pluginData: GuildPluginData<EconomyPluginType>): EmbedBuilder {
    const config = pluginData.config.get();
    const prefix = getGuildPrefix(pluginData);
    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const gameEntries = Object.entries(config.games);
    const hasWagerGames = gameEntries.some(([, game]) => game.type === "wager");
    const hasRewardGames = gameEntries.some(([, game]) => game.type === "reward");

    const sections: string[] = [
        `${emojiPrefix}**${config.currency_name}** is this server's currency. Check your balance, trade for it, and wager it on games below.`,
    ];

    const commandLines = [
        `\`${prefix}balance [user]\` — check a ${config.currency_name} balance`,
        `\`${prefix}balance leaderboard\` — see the top ${config.currency_name} holders`,
        `\`${prefix}give <user> <amount|all>\` — give another user some of your ${config.currency_name}${
            config.give.fee ? ` (${Math.round(config.give.fee * 100)}% fee)` : ""
        }`,
    ];
    if (gameEntries.length) {
        commandLines.push(`\`${prefix}games\` — list games and their odds`);
    }
    if (hasWagerGames) {
        commandLines.push(`\`${prefix}play <game> <amount|all>\` — wager ${config.currency_name} on a game`);
    }
    if (hasRewardGames) {
        commandLines.push(`\`${prefix}work\` — claim a free, cooldown-gated payout`);
    }
    if (config.trade) {
        commandLines.push(`\`${prefix}trade <amount|all>\` — trade points for ${config.currency_name}`);
        commandLines.push(`\`${prefix}tradeback <amount|all>\` — trade ${config.currency_name} back for points`);
    }
    sections.push(`**Commands**\n${commandLines.join("\n")}`);

    if (config.trade) {
        const sellRate = config.trade.coins_per_point_sell ?? config.trade.coins_per_point;
        const tradeLines = [
            `Buy: 1 point → **${config.trade.coins_per_point}** ${config.currency_name}`,
            `Sell: **${sellRate}** ${config.currency_name} → 1 point`,
        ];
        sections.push(`**Trading**\n${tradeLines.join("\n")}`);
    }

    if (gameEntries.length) {
        const gameLines = gameEntries.map(([gameName, game]) => {
            const label = game.label ?? gameName;
            const emoji = game.emoji ? `${game.emoji} ` : "";
            const cooldownMs = game.cooldown ? convertDelayStringToMS(game.cooldown) : null;
            const cooldownText = cooldownMs ? `, cooldown ${humanizeDuration(cooldownMs)}` : "";

            if (game.type === "reward") {
                const winText =
                    game.win_chance >= 1 ? "Guaranteed" : `${Math.round(game.win_chance * 100)}% chance for`;
                return `${emoji}**${label}** (\`${prefix}work\`) — ${winText} **${formatRewardAmount(game.reward)}** ${config.currency_name}${cooldownText}`;
            }

            const winPercent = Math.round(game.win_chance * 100);
            return `${emoji}**${label}** (\`${prefix}play ${gameName} <amount>\`) — ${winPercent}% to win **${formatWinMultiplier(game.win_multiplier)}**, bet ${game.min_bet}-${game.max_bet}${cooldownText}`;
        });
        sections.push(`**Games**\n${gameLines.join("\n")}`);
    }

    return new EmbedBuilder()
        .setColor(0x0159b2)
        .setTitle(`How ${config.currency_name} Works`)
        .setDescription(sections.join("\n\n"));
}
