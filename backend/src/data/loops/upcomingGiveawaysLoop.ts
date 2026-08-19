// tslint:disable:no-console

import moment from "moment-timezone";
import { lazyMemoize, MINUTES } from "../../utils.js";
import { Giveaway } from "../entities/Giveaway.js";
import { Giveaways } from "../Giveaways.js";
import { emitGuildEvent, hasGuildEventListener } from "../GuildEvents.js";
import Timeout = NodeJS.Timeout;

const LOOP_INTERVAL = 15 * MINUTES;
const MAX_TRIES_PER_SERVER = 3;
const getGiveawaysRepository = lazyMemoize(() => new Giveaways());
const timeouts = new Map<number, Timeout>();

function broadcastGiveawayEnd(giveaway: Giveaway, tries = 0) {
  if (!hasGuildEventListener(giveaway.guild_id, "giveawayEnd")) {
    // If there are no listeners registered for the server yet, try again in a bit
    if (tries < MAX_TRIES_PER_SERVER) {
      timeouts.set(
        giveaway.id,
        setTimeout(() => broadcastGiveawayEnd(giveaway, tries + 1), 1 * MINUTES),
      );
    }
    return;
  }
  emitGuildEvent(giveaway.guild_id, "giveawayEnd", [giveaway]);
}

export async function runUpcomingGiveawaysLoop() {
  console.log("[GIVEAWAYS LOOP] Clearing old timeouts");
  for (const timeout of timeouts.values()) {
    clearTimeout(timeout);
  }

  console.log("[GIVEAWAYS LOOP] Setting timeouts for upcoming giveaways");
  const giveawaysDueSoon = await getGiveawaysRepository().getGiveawaysDueSoon(LOOP_INTERVAL);
  for (const giveaway of giveawaysDueSoon) {
    const remaining = Math.max(0, moment.utc(giveaway.ends_at).diff(moment.utc()));
    timeouts.set(
      giveaway.id,
      setTimeout(() => broadcastGiveawayEnd(giveaway), remaining),
    );
  }

  console.log("[GIVEAWAYS LOOP] Scheduling next loop");
  setTimeout(() => runUpcomingGiveawaysLoop(), LOOP_INTERVAL);
}

export function registerUpcomingGiveaway(giveaway: Giveaway) {
  clearUpcomingGiveaway(giveaway);

  console.log("[GIVEAWAYS LOOP] Registering new upcoming giveaway");
  const remaining = Math.max(0, moment.utc(giveaway.ends_at).diff(moment.utc()));
  if (remaining > LOOP_INTERVAL) {
    return;
  }

  timeouts.set(
    giveaway.id,
    setTimeout(() => broadcastGiveawayEnd(giveaway), remaining),
  );
}

export function clearUpcomingGiveaway(giveaway: Giveaway) {
  console.log("[GIVEAWAYS LOOP] Clearing upcoming giveaway");
  if (timeouts.has(giveaway.id)) {
    clearTimeout(timeouts.get(giveaway.id)!);
  }
}
