import { GuildPluginData } from "vety";
import { logger } from "../../../logger.js";
import { EconomyPluginType } from "../types.js";

export type GameHistoryOutcome = "win" | "loss" | "push";
export type GameHistoryGameType = "wager" | "reward" | "blackjack" | "pvp" | "hol";

export interface GameHistoryEntryInput {
  userId: string;
  gameName: string;
  gameType: GameHistoryGameType;
  outcome: GameHistoryOutcome;
  betAmount: number;
  amountChanged: number;
  balanceAfter: number;
  // The opposing player's user ID for PvP entries, or "bot" when played against the bot.
  opponentId?: string | null;
}

/**
 * Records a single game outcome to the game history table so staff can later audit a user's play (e.g. after
 * abuse of a game is discovered and it's unclear how many coins to claw back). Never throws — a logging failure
 * shouldn't block the game result from reaching the player.
 */
export async function logGameHistory(
  pluginData: GuildPluginData<EconomyPluginType>,
  entry: GameHistoryEntryInput,
): Promise<void> {
  try {
    await pluginData.state.gameHistory.addEntry(entry);
  } catch (err) {
    logger.error(err, "Failed to log economy game history entry");
  }
}
