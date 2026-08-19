import { GuildPluginData } from "vety";
import { logger } from "../../../logger.js";
import { EconomyPluginType } from "../types.js";

export type GameHistoryOutcome = "win" | "loss" | "push";
// "give"/"trade"/"tradeback" aren't games — they're player-initiated transfers/conversions (see giveCoins.ts and
// tradeCoins.ts). "admin_adjust" is a manager manually giving/subtracting/setting someone's balance from the
// dashboard (see api/guilds/economy.ts's POST /economy/user/:userId/balance). All four are logged into the same
// table so they show up alongside actual plays in a user's history and the dashboard's activity feed, but
// excluded from game-specific analytics (games played/wagered/won/lost) — see NON_GAME_TYPES below.
export type GameHistoryGameType = "wager" | "reward" | "blackjack" | "pvp" | "hol" | "give" | "trade" | "tradeback" | "admin_adjust";

// The non-game types (see the GameHistoryGameType comment above) — shared by the guild-wide analytics query
// (excludes these) and previously the dashboard's own transaction feed, which now shows everything instead.
export const NON_GAME_TYPES: GameHistoryGameType[] = ["give", "trade", "tradeback", "admin_adjust"];

export interface GameHistoryEntryInput {
  userId: string;
  gameName: string;
  gameType: GameHistoryGameType;
  outcome: GameHistoryOutcome;
  betAmount: number;
  amountChanged: number;
  balanceAfter: number;
  // The opposing player's user ID for PvP entries, "bot" when played against the bot, the other party for a
  // "give" transfer, or the acting manager's user ID for an "admin_adjust" entry.
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
