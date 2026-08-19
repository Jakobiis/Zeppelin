import moment from "moment-timezone";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { Giveaways } from "../../../data/Giveaways.js";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { clearUpcomingGiveaway } from "../../../data/loops/upcomingGiveawaysLoop.js";
import { clearUpcomingClaimDeadline } from "../../../data/loops/upcomingClaimDeadlinesLoop.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { DBDateFormat } from "../../../utils.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";
import { armClaimDeadlines } from "./claimGiveaway.js";
import { buildWinnerAnnouncementButtons } from "./buildGiveawayMessage.js";
import { deleteWinnerThreads } from "./cleanupGiveawayThreads.js";
import { editChannelMessage, sendChannelMessage } from "./discordRest.js";
import { rollWinners } from "./rollWinners.js";

const giveaways = new Giveaways();
const giveawayEntries = new GiveawayEntries();

function buildEndedEmbed(giveaway: Giveaway, cancelled: boolean, participantCount: number) {
  const color = giveaway.embed_color ?? DEFAULT_EMBED_COLOR;
  const title = giveaway.prize;
  const infoLines = [`Host: <@${giveaway.host_id}>`, `Participants: **${participantCount}**`];

  if (cancelled) {
    return {
      title,
      description: [`🚫 This giveaway was cancelled.`, ...infoLines].join("\n"),
      color,
    };
  }

  const winnerLines =
    giveaway.winner_ids.length > 0
      ? giveaway.winner_ids.map((id) => `<@${id}>`).join(", ")
      : "No valid entries — no winner could be selected.";

  return {
    title,
    description: [`🎉 Giveaway ended!`, `**Winner(s):** ${winnerLines}`, ...infoLines].join("\n"),
    color,
  };
}

function buildWinnerAnnouncementPayload(giveaway: Giveaway) {
  const mentions = giveaway.winner_ids.map((id) => `<@${id}>`).join(", ");
  const claimLine =
    giveaway.claim_time_ms != null
      ? `\nClick 🎉 **Claim Prize** within **${humanizeDuration(giveaway.claim_time_ms)}** or you'll be rerolled!`
      : "";
  return {
    content: `🎉 Congratulations ${mentions}! You won **${giveaway.prize}**!${claimLine}`,
    allowed_mentions: { users: giveaway.winner_ids },
    components: buildWinnerAnnouncementButtons(giveaway.id).map((row) => row.toJSON()),
  };
}

/**
 * Ends (or cancels) a giveaway: rolls winners (unless cancelled), persists the result, disables the entry
 * button on the original message, and posts a winner announcement. Idempotent — calling this on an
 * already-finalized giveaway is a no-op, since the loop's timer, `-giveaway end`, and the dashboard's "End now"
 * can all race to call this for the same giveaway.
 */
export async function finalizeGiveaway(giveawayId: number, opts: { cancelled: boolean }): Promise<Giveaway> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway) {
    throw new Error(`Giveaway ${giveawayId} not found`);
  }
  if (giveaway.status !== "running") {
    return giveaway;
  }

  const winnerIds = opts.cancelled ? [] : await rollWinners(giveawayId, giveaway.winner_count);

  await giveaways.update(giveawayId, {
    status: opts.cancelled ? "cancelled" : "ended",
    winner_ids: winnerIds,
    ended_at: moment.utc().format(DBDateFormat),
  });

  clearUpcomingGiveaway(giveaway);

  let updated = (await giveaways.find(giveawayId))!;

  if (updated.message_id) {
    const participantCount = await giveawayEntries.count(giveawayId);
    await editChannelMessage(updated.channel_id, updated.message_id, {
      embeds: [buildEndedEmbed(updated, opts.cancelled, participantCount)],
      components: [],
    }).catch(() => null);
  }

  if (!opts.cancelled && updated.winner_ids.length > 0) {
    updated = await armClaimDeadlines(updated, winnerIds);
    await sendChannelMessage(updated.channel_id, buildWinnerAnnouncementPayload(updated)).catch(() => null);
  }

  return updated;
}

/**
 * Replaces the selected current winners on an already-ended giveaway. Every historical winner remains excluded
 * from the new draw, while replaced winners are marked inactive so the dashboard shows only the replacements.
 */
export async function rerollGiveaway(giveawayId: number, replaceWinnerIds: string[]): Promise<{ giveaway: Giveaway; newWinnerIds: string[] }> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway) {
    throw new Error(`Giveaway ${giveawayId} not found`);
  }
  if (giveaway.status !== "ended") {
    throw new Error("Only an ended giveaway can be rerolled");
  }

  const newWinnerIds = await rollWinners(giveawayId, replaceWinnerIds.length, giveaway.winner_ids);
  const allWinnerIds = [...giveaway.winner_ids, ...newWinnerIds];
  const remainingDeadlines = { ...giveaway.winner_claim_deadlines };
  for (const winnerId of replaceWinnerIds) delete remainingDeadlines[winnerId];
  const winnerThreadIds = await deleteWinnerThreads(giveaway, replaceWinnerIds);

  await giveaways.update(giveawayId, {
    winner_ids: allWinnerIds,
    expired_winner_ids: [...new Set([...giveaway.expired_winner_ids, ...replaceWinnerIds])],
    winner_claim_deadlines: remainingDeadlines,
    winner_thread_ids: winnerThreadIds,
  });
  clearUpcomingClaimDeadline(giveaway);

  let updated = (await giveaways.find(giveawayId))!;

  if (newWinnerIds.length > 0) {
    updated = await armClaimDeadlines(updated, newWinnerIds);

    const claimLine =
      updated.claim_time_ms != null
        ? `\nClick 🎉 **Claim Prize** within **${humanizeDuration(updated.claim_time_ms)}** or you'll be rerolled!`
        : "";

    await sendChannelMessage(updated.channel_id, {
      content: `🎉 Giveaway rerolled for **${updated.prize}**! New winner(s): ${newWinnerIds.map((id) => `<@${id}>`).join(", ")}${claimLine}`,
      allowed_mentions: { users: newWinnerIds },
      components: buildWinnerAnnouncementButtons(updated.id).map((row) => row.toJSON()),
    }).catch(() => null);
  }
  // No Discord message when there's no one left to reroll to — callers (the chat command, the dashboard) each
  // report that through their own feedback channel instead (newWinnerIds.length === 0 tells them to).

  return { giveaway: updated, newWinnerIds };
}
