import moment from "moment-timezone";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { Giveaways } from "../../../data/Giveaways.js";
import { clearUpcomingClaimDeadline, registerUpcomingClaimDeadline } from "../../../data/loops/upcomingClaimDeadlinesLoop.js";
import { DBDateFormat } from "../../../utils.js";
import { buildWinnerAnnouncementButtons, currentWinnerIds } from "./buildGiveawayMessage.js";
import { deleteWinnerThreads } from "./cleanupGiveawayThreads.js";
import { sendChannelMessage } from "./discordRest.js";
import { rollWinners } from "./rollWinners.js";

const giveaways = new Giveaways();

// Sets a claim deadline for each of `winnerIds` (claim_time_ms from now) and arms the claim-deadlines loop —
// shared by finalizeGiveaway.ts (initial winners) and rerollGiveaway/processExpiredClaims below (replacement
// winners), so every winner gets the same claim window regardless of how they were picked. No-op if the
// giveaway has no claim_time_ms configured.
export async function armClaimDeadlines(giveaway: Giveaway, winnerIds: string[]): Promise<Giveaway> {
  if (giveaway.claim_time_ms == null || winnerIds.length === 0) {
    return giveaway;
  }

  const deadline = moment.utc().add(giveaway.claim_time_ms, "ms").format(DBDateFormat);
  const nextDeadlines = { ...giveaway.winner_claim_deadlines };
  for (const winnerId of winnerIds) {
    nextDeadlines[winnerId] = deadline;
  }

  await giveaways.update(giveaway.id, { winner_claim_deadlines: nextDeadlines });
  const updated = (await giveaways.find(giveaway.id))!;
  registerUpcomingClaimDeadline(updated);
  return updated;
}

/**
 * Marks `winnerId` as having claimed their prize, if they currently have a pending claim on this giveaway.
 * Returns false (no-op) if they don't — already claimed, already expired, or never had a claim requirement. If
 * this was the last current winner still owed a claim, closes the giveaway out (see closeOutFullyClaimedGiveaway).
 */
export async function markWinnerClaimed(giveawayId: number, winnerId: string): Promise<boolean> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway || !(winnerId in giveaway.winner_claim_deadlines)) {
    return false;
  }

  const nextDeadlines = { ...giveaway.winner_claim_deadlines };
  delete nextDeadlines[winnerId];

  await giveaways.update(giveawayId, {
    winner_claim_deadlines: nextDeadlines,
    claimed_winner_ids: [...giveaway.claimed_winner_ids, winnerId],
  });

  const updated = (await giveaways.find(giveawayId))!;
  registerUpcomingClaimDeadline(updated);

  const stillHeldWinnerIds = currentWinnerIds(updated);
  const allClaimed = stillHeldWinnerIds.length > 0 && stillHeldWinnerIds.every((id) => updated.claimed_winner_ids.includes(id));
  if (allClaimed) {
    await closeOutFullyClaimedGiveaway(updated, stillHeldWinnerIds);
  }

  return true;
}

/**
 * Once every current winner of a giveaway has claimed their prize, there's nothing left to coordinate — deletes
 * everyone's remaining private thread, marks them all closed (see the entity comment on
 * winner_thread_closed_ids — this blocks re-creating one afterward, same as the manual "Delete Thread" button),
 * and announces the giveaway is fully wrapped up.
 */
async function closeOutFullyClaimedGiveaway(giveaway: Giveaway, winnerIds: string[]): Promise<void> {
  const nextThreadIds = await deleteWinnerThreads(giveaway, winnerIds);
  await giveaways.update(giveaway.id, {
    winner_thread_ids: nextThreadIds,
    winner_thread_closed_ids: [...new Set([...giveaway.winner_thread_closed_ids, ...winnerIds])],
  });

  await sendChannelMessage(giveaway.channel_id, {
    content: `✅ All prizes for **${giveaway.prize}** have been claimed! Winner threads have been closed.`,
  }).catch(() => null);
}

/**
 * Rerolls every winner on `giveaway` whose claim deadline has passed: moves them to expired_winner_ids, rolls
 * that many replacement winners (excluding everyone who's ever won, same as a manual reroll), arms claim
 * deadlines for the replacements, and announces the swap. Called from the claim-deadlines loop
 * (giveawayClaimExpired) — re-derives who's actually overdue at call time rather than trusting the event
 * payload, since a claim can land in the gap between the loop firing and this running.
 */
export async function processExpiredClaims(giveawayId: number): Promise<void> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway) return;

  const now = moment.utc();
  const overdueWinnerIds = Object.entries(giveaway.winner_claim_deadlines)
    .filter(([, deadline]) => moment.utc(deadline).isSameOrBefore(now))
    .map(([winnerId]) => winnerId);

  if (overdueWinnerIds.length === 0) {
    return;
  }

  const remainingDeadlines = { ...giveaway.winner_claim_deadlines };
  for (const winnerId of overdueWinnerIds) {
    delete remainingDeadlines[winnerId];
  }

  const replacementWinnerIds = await rollWinners(giveawayId, overdueWinnerIds.length, giveaway.winner_ids);
  const winnerThreadIds = await deleteWinnerThreads(giveaway, overdueWinnerIds);

  await giveaways.update(giveawayId, {
    winner_ids: [...giveaway.winner_ids, ...replacementWinnerIds],
    expired_winner_ids: [...giveaway.expired_winner_ids, ...overdueWinnerIds],
    winner_claim_deadlines: remainingDeadlines,
    winner_thread_ids: winnerThreadIds,
  });

  clearUpcomingClaimDeadline(giveaway);

  let updated = (await giveaways.find(giveawayId))!;
  if (replacementWinnerIds.length > 0) {
    updated = await armClaimDeadlines(updated, replacementWinnerIds);
  } else {
    registerUpcomingClaimDeadline(updated);
  }

  const expiredMentions = overdueWinnerIds.map((id) => `<@${id}>`).join(", ");
  if (replacementWinnerIds.length > 0) {
    const newMentions = replacementWinnerIds.map((id) => `<@${id}>`).join(", ");
    await sendChannelMessage(updated.channel_id, {
      content: `⌛ ${expiredMentions} didn't claim **${updated.prize}** in time and ${overdueWinnerIds.length === 1 ? "was" : "were"} rerolled. New winner(s): ${newMentions}`,
      allowed_mentions: { users: [...overdueWinnerIds, ...replacementWinnerIds] },
      components: buildWinnerAnnouncementButtons(updated.id, true).map((row) => row.toJSON()),
    }).catch(() => null);
  } else {
    await sendChannelMessage(updated.channel_id, {
      content: `⌛ ${expiredMentions} didn't claim **${updated.prize}** in time, but there were no other eligible entries to reroll to.`,
      allowed_mentions: { users: overdueWinnerIds },
    }).catch(() => null);
  }
}
