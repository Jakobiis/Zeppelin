// tslint:disable:no-console

import moment from "moment-timezone";
import { lazyMemoize, MINUTES } from "../../utils.js";
import { Giveaway } from "../entities/Giveaway.js";
import { Giveaways } from "../Giveaways.js";
import { emitGuildEvent, hasGuildEventListener } from "../GuildEvents.js";
import Timeout = NodeJS.Timeout;

// Same interval/rationale as upcomingGiveawaysLoop.ts.
const LOOP_INTERVAL = 2 * MINUTES;
const MAX_TRIES_PER_SERVER = 3;
const getGiveawaysRepository = lazyMemoize(() => new Giveaways());
const timeouts = new Map<number, Timeout>();

// The earliest still-pending claim deadline for a giveaway, or null if it has none right now (everyone's
// claimed, expired, or it never had a claim requirement). Firing on the *earliest* one is enough — the handler
// (processExpiredClaims) re-derives which winners are actually overdue at fire time, so an earlier deadline
// firing first just means a later one gets picked up a little sooner than strictly necessary, never late.
function earliestPendingDeadline(giveaway: Giveaway): string | null {
  const deadlines = Object.values(giveaway.winner_claim_deadlines);
  if (deadlines.length === 0) return null;
  return deadlines.reduce((earliest, d) => (moment.utc(d).isBefore(moment.utc(earliest)) ? d : earliest));
}

function broadcastClaimExpired(giveaway: Giveaway, tries = 0) {
  if (!hasGuildEventListener(giveaway.guild_id, "giveawayClaimExpired")) {
    if (tries < MAX_TRIES_PER_SERVER) {
      timeouts.set(
        giveaway.id,
        setTimeout(() => broadcastClaimExpired(giveaway, tries + 1), 1 * MINUTES),
      );
    }
    return;
  }
  emitGuildEvent(giveaway.guild_id, "giveawayClaimExpired", [giveaway]);
}

export async function runUpcomingClaimDeadlinesLoop() {
  console.log("[CLAIM DEADLINES LOOP] Clearing old timeouts");
  for (const timeout of timeouts.values()) {
    clearTimeout(timeout);
  }

  console.log("[CLAIM DEADLINES LOOP] Setting timeouts for upcoming claim deadlines");
  const pending = await getGiveawaysRepository().getGiveawaysWithPendingClaims();
  for (const giveaway of pending) {
    const deadline = earliestPendingDeadline(giveaway);
    if (!deadline) continue;

    const remaining = moment.utc(deadline).diff(moment.utc());
    if (remaining > LOOP_INTERVAL) continue;

    timeouts.set(
      giveaway.id,
      setTimeout(() => broadcastClaimExpired(giveaway), Math.max(0, remaining)),
    );
  }

  console.log("[CLAIM DEADLINES LOOP] Scheduling next loop");
  setTimeout(() => runUpcomingClaimDeadlinesLoop(), LOOP_INTERVAL);
}

// Called right after setting/updating a giveaway's winner_claim_deadlines (initial finalize, manual reroll, or
// a claim-expiry reroll cascade) so a short claim window doesn't have to wait for the next periodic poll.
export function registerUpcomingClaimDeadline(giveaway: Giveaway) {
  clearUpcomingClaimDeadline(giveaway);

  const deadline = earliestPendingDeadline(giveaway);
  if (!deadline) return;

  const remaining = moment.utc(deadline).diff(moment.utc());
  if (remaining > LOOP_INTERVAL) return;

  console.log("[CLAIM DEADLINES LOOP] Registering new upcoming claim deadline");
  timeouts.set(
    giveaway.id,
    setTimeout(() => broadcastClaimExpired(giveaway), Math.max(0, remaining)),
  );
}

export function clearUpcomingClaimDeadline(giveaway: Giveaway) {
  if (timeouts.has(giveaway.id)) {
    console.log("[CLAIM DEADLINES LOOP] Clearing upcoming claim deadline");
    clearTimeout(timeouts.get(giveaway.id)!);
  }
}
