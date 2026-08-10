import { User } from "discord.js";
import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";
import { PvpChannel } from "./pvpMatch.js";

/** Same idea as PvpMatchContext, but for a solo player facing the bot instead of a second human — no
 * opponentId/escrow-for-two, since the bot has no balance of its own. Carries the full `player` User (not just
 * their ID) so variant handlers can set the embed author (avatar + username) without an extra fetch. */
export interface PvpBotMatchContext {
  pluginData: GuildPluginData<EconomyPluginType>;
  channel: PvpChannel;
  player: User;
  playerId: string;
  amount: number;
  label: string;
  emojiPrefix: string;
  currencyName: string;
}

// "loss" (the bot won) is distinct from a real-PvP loss — there's no second player to credit, the player's
// already-escrowed bet is simply not returned.
export type PvpBotMatchOutcome = { type: "win" } | { type: "push" } | { type: "loss" };

export type PlayPvpBotMatchFn = (ctx: PvpBotMatchContext) => Promise<PvpBotMatchOutcome>;
