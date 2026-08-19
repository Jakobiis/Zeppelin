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
 * Pauses `winnerId`'s reroll deadline — called when they open their prize thread (see
 * giveawayButtonInteraction.ts's "giveawayThread" handler), which counts as "showing up" even though the prize
 * hasn't actually changed hands yet (see confirmWinnerClaimed below for that part). A winner who's opened their
 * thread is never rerolled for missing the deadline, regardless of what happens to the thread afterward — no-op
 * if they don't currently have a pending deadline (no claim requirement, already paused, or already expired).
 */
export async function pauseClaimDeadline(giveawayId: number, winnerId: string): Promise<void> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway || !(winnerId in giveaway.winner_claim_deadlines)) {
    return;
  }

  const nextDeadlines = { ...giveaway.winner_claim_deadlines };
  delete nextDeadlines[winnerId];
  await giveaways.update(giveawayId, { winner_claim_deadlines: nextDeadlines });

  const updated = (await giveaways.find(giveawayId))!;
  registerUpcomingClaimDeadline(updated);
}

/**
 * Confirms `winnerId` actually received their prize — clicked from inside that winner's thread, restricted (at
 * the interaction-handling end, not here) to the giveaway's host or holder, i.e. whoever actually handed the
 * prize over. This is the one thing that finalizes a claim: opening the thread only pauses the reroll deadline
 * (see pauseClaimDeadline above) to prove the winner showed up, it doesn't confirm the handoff itself — if the
 * thread gets deleted before this is ever clicked, the winner was never actually marked as having claimed
 * anything, by design. Also blocks the winner from opening another thread for this giveaway (see the entity
 * comment on winner_thread_closed_ids). Returns false if there's nothing to confirm (not a current winner, or
 * already confirmed).
 */
export async function confirmWinnerClaimed(giveawayId: number, winnerId: string): Promise<boolean> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway || !currentWinnerIds(giveaway).includes(winnerId) || giveaway.claimed_winner_ids.includes(winnerId)) {
    return false;
  }

  await giveaways.update(giveawayId, {
    claimed_winner_ids: [...giveaway.claimed_winner_ids, winnerId],
    winner_thread_closed_ids: [...new Set([...giveaway.winner_thread_closed_ids, winnerId])],
  });

  const updated = (await giveaways.find(giveawayId))!;

  // Just an announcement at this point — each winner's thread is closed out individually by a manager reviewing
  // and deleting it (see giveawayButtonInteraction.ts's "giveawayThreadDelete"), not automatically here.
  const stillHeldWinnerIds = currentWinnerIds(updated);
  const allClaimed = stillHeldWinnerIds.length > 0 && stillHeldWinnerIds.every((id) => updated.claimed_winner_ids.includes(id));
  if (allClaimed) {
    await sendChannelMessage(updated.channel_id, {
      content: `✅ All prizes for **${updated.prize}** have been claimed!`,
    }).catch(() => null);
  }

  return true;
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
      components: buildWinnerAnnouncementButtons(updated.id).map((row) => row.toJSON()),
    }).catch(() => null);
  } else {
    await sendChannelMessage(updated.channel_id, {
      content: `⌛ ${expiredMentions} didn't claim **${updated.prize}** in time, but there were no other eligible entries to reroll to.`,
      allowed_mentions: { users: overdueWinnerIds },
    }).catch(() => null);
  }
}
