import { Giveaway } from "../../../data/entities/Giveaway.js";
import { deleteChannel } from "./discordRest.js";

/**
 * Deletes the private Discord threads for `winnerIds` and drops them from winner_thread_ids — shared by every
 * "this winner's thread is done" path: a reroll/claim-expiry (the winner no longer holds the prize at all —
 * see finalizeGiveaway.ts's rerollGiveaway and claimGiveaway.ts's processExpiredClaims) and everyone claiming
 * (the prize was successfully handed off — see claimGiveaway.ts's markWinnerClaimed). Failed/already-deleted
 * Discord threads are harmless (deleteChannel's own .catch(() => null) below).
 */
export async function deleteWinnerThreads(giveaway: Giveaway, winnerIds: string[]): Promise<Record<string, string>> {
  const nextThreadIds = { ...giveaway.winner_thread_ids };
  const threadIds = winnerIds.map((winnerId) => nextThreadIds[winnerId]).filter((threadId): threadId is string => threadId != null);
  for (const winnerId of winnerIds) delete nextThreadIds[winnerId];

  await Promise.all(threadIds.map((threadId) => deleteChannel(threadId).catch(() => null)));
  return nextThreadIds;
}
