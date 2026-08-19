import { Giveaway } from "../../../data/entities/Giveaway.js";
import { deleteChannel } from "./discordRest.js";

/** Delete private winner threads for winners who no longer hold the prize. Failed/deleted Discord threads are harmless. */
export async function cleanupRerolledWinnerThreads(giveaway: Giveaway, winnerIds: string[]): Promise<Record<string, string>> {
  const nextThreadIds = { ...giveaway.winner_thread_ids };
  const threadIds = winnerIds.map((winnerId) => nextThreadIds[winnerId]).filter((threadId): threadId is string => threadId != null);
  for (const winnerId of winnerIds) delete nextThreadIds[winnerId];

  await Promise.all(threadIds.map((threadId) => deleteChannel(threadId).catch(() => null)));
  return nextThreadIds;
}
