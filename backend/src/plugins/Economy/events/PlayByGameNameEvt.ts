import { Message } from "discord.js";
import { guildPluginEventListener } from "vety";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { findGameEntry } from "../functions/findGame.js";
import { EconomyPluginType } from "../types.js";

/**
 * Lets players type `!coinflip 100` instead of `!play coinflip 100`: rewrites the message to the `play` form and
 * re-dispatches it, so PlayCmd's permissions, signatures and validation all still apply (same trick as
 * CommandAliases). Reward games are skipped since they're claimed via `!work`.
 * ponytail: a game named like an existing command (e.g. "balance") would run both; rename the game if that happens.
 */
export const PlayByGameNameEvt = guildPluginEventListener<EconomyPluginType>()({
  event: "messageCreate",
  async listener({ pluginData, args: { message } }) {
    if (message.author.bot || message.webhookId || !message.content) return;

    const prefix = getGuildPrefix(pluginData);
    if (!message.content.startsWith(prefix)) return;

    const rest = message.content.slice(prefix.length);
    const entry = findGameEntry(pluginData.config.get().games, rest.split(/\s/, 1)[0]);
    if (!entry || entry[1].type === "reward") return;

    const copy = Object.create(message) as Message;
    copy.content = `${prefix}play ${rest}`;
    await pluginData.getVetyInstance().dispatchMessageCommands(copy);
  },
});
