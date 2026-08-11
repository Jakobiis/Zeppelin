import { EmbedBuilder, Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { EconomyPluginType } from "../types.js";
import { buildCoinsSourceLines } from "./buildCoinsSourceLines.js";
import { formatAmount } from "./formatAmount.js";
import { formatRewardAmount, formatWinMultiplier } from "./numberOrRange.js";

const PVP_VARIANT_NAMES = {
    rock_paper_scissors: "Rock Paper Scissors",
    dice_duel: "Dice Duel",
    tic_tac_toe: "Tic Tac Toe",
};

export async function buildEconomyInfoEmbed(
    pluginData: GuildPluginData<EconomyPluginType>,
    message: OmitPartialGroupDMChannel<Message>,
): Promise<EmbedBuilder> {
    const config = pluginData.config.get();
    const prefix = getGuildPrefix(pluginData);
    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const gameEntries = Object.entries(config.games);
    const hasWagerGames = gameEntries.some(([, game]) => game.type === "wager");
    const hasRewardGames = gameEntries.some(([, game]) => game.type === "reward");
    const hasBlackjackGames = gameEntries.some(([, game]) => game.type === "blackjack");
    const hasPvpGames = gameEntries.some(([, game]) => game.type === "pvp");

    const sections: string[] = [
        `${emojiPrefix}**${config.currency_name}** is this server's currency. Check your balance, trade for it, and wager it on games below.`,
    ];

    const coinsSourceLines = await buildCoinsSourceLines(pluginData, message);
    if (coinsSourceLines.length) {
        sections.push(`**Earning ${config.currency_name} From Messages**\n${coinsSourceLines.join("\n")}`);
    }

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
    if (hasWagerGames || hasBlackjackGames) {
        commandLines.push(`\`${prefix}play <game> <amount|all>\` — wager ${config.currency_name} on a game`);
    }
    if (hasRewardGames) {
        commandLines.push(`\`${prefix}work\` — claim a free, cooldown-gated payout`);
    }
    if (hasPvpGames) {
        commandLines.push(
            `\`${prefix}play <game> [@user] <amount|all>\` — challenge another user for ${config.currency_name}, or the bot if you omit @user`,
        );
        commandLines.push(`\`${prefix}pvp\` — toggle whether you can be challenged to PvP games`);
    }
    if (config.trade) {
        commandLines.push(`\`${prefix}trade <amount|all>\` — trade points for ${config.currency_name}`);
        commandLines.push(`\`${prefix}tradeback <amount|all>\` — trade ${config.currency_name} back for points`);
    }
    sections.push(`**Commands**\n${commandLines.join("\n")}`);

    if (config.trade) {
        const sellRate = config.trade.coins_per_point_sell ?? config.trade.coins_per_point;
        const tradeLines = [
            `Buy: 1 point → **${formatAmount(config.trade.coins_per_point)}** ${config.currency_name}`,
            `Sell: **${formatAmount(sellRate)}** ${config.currency_name} → 1 point`,
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

            if (game.type === "blackjack") {
                return `${emoji}**${label}** (\`${prefix}play ${gameName} <amount>\`) — standard blackjack, pays **${game.blackjack_payout}x** on a natural, bet ${formatAmount(game.min_bet)}-${formatAmount(game.max_bet)}${cooldownText}`;
            }

            if (game.type === "pvp") {
                const variantName = PVP_VARIANT_NAMES[game.variant];
                return `${emoji}**${label}** (\`${prefix}play ${gameName} [@user] <amount>\`) — ${variantName}, vs a player or the bot, bet ${formatAmount(game.min_bet)}-${formatAmount(game.max_bet)}${cooldownText}`;
            }

            if (game.type === "hol") {
                return `${emoji}**${label}** (\`${prefix}play ${gameName} <amount>\`) — guess higher/lower/same, chain multipliers **${game.min_multiplier}x**-**${game.max_multiplier}x**, bet ${formatAmount(game.min_bet)}-${formatAmount(game.max_bet)}${cooldownText}`;
            }

            const winPercent = Math.round(game.win_chance * 100);
            return `${emoji}**${label}** (\`${prefix}play ${gameName} <amount>\`) — ${winPercent}% to win **${formatWinMultiplier(game.win_multiplier)}**, bet ${formatAmount(game.min_bet)}-${formatAmount(game.max_bet)}${cooldownText}`;
        });
        sections.push(`**Games**\n${gameLines.join("\n")}`);
    }

    return new EmbedBuilder()
        .setColor(0x0159b2)
        .setTitle(`How ${config.currency_name} Works`)
        .setDescription(sections.join("\n\n"));
}
