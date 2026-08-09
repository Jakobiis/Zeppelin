import { Message, OmitPartialGroupDMChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { EconomyPluginType } from "../types.js";

export type PvpChannel = OmitPartialGroupDMChannel<Message>["channel"];

/** Everything a specific PvP variant (RPS/dice duel/tic-tac-toe) needs to run a match — bets are already escrowed
 * by the time a variant's play function is called; it only needs to decide who won (or that it was a push). */
export interface PvpMatchContext {
  pluginData: GuildPluginData<EconomyPluginType>;
  channel: PvpChannel;
  challengerId: string;
  opponentId: string;
  amount: number;
  label: string;
  emojiPrefix: string;
  currencyName: string;
}

export type PvpMatchOutcome = { type: "win"; winnerId: string } | { type: "push" };

export type PlayPvpMatchFn = (ctx: PvpMatchContext) => Promise<PvpMatchOutcome>;
