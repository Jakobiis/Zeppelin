import { z } from "zod";
import { zEconomyGame } from "../types.js";

/**
 * Looks up a game by its exact config key, or (if that fails) by one of its configured aliases — so a player
 * typing `ttt` finds a game configured under the key `tictactoe` with `aliases: [ttt]`. Both checks are
 * case-sensitive, matching a plain object-key lookup. Returns the game's canonical key alongside its config so
 * callers can use that key consistently downstream (cooldowns, game history, embed labels, etc.) regardless of
 * which name or alias the player actually typed.
 */
export function findGameEntry(
  games: Record<string, z.infer<typeof zEconomyGame>>,
  nameOrAlias: string,
): [string, z.infer<typeof zEconomyGame>] | null {
  if (games[nameOrAlias]) {
    return [nameOrAlias, games[nameOrAlias]];
  }

  for (const [key, game] of Object.entries(games)) {
    if (game.aliases?.includes(nameOrAlias)) {
      return [key, game];
    }
  }

  return null;
}
