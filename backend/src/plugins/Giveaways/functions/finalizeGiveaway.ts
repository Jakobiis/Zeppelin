import moment from "moment-timezone";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { Giveaways } from "../../../data/Giveaways.js";
import { clearUpcomingGiveaway } from "../../../data/loops/upcomingGiveawaysLoop.js";
import { DBDateFormat } from "../../../utils.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";
import { editChannelMessage, sendChannelMessage } from "./discordRest.js";
import { rollWinners } from "./rollWinners.js";

const giveaways = new Giveaways();

function buildEndedEmbed(giveaway: Giveaway, cancelled: boolean) {
  const color = giveaway.embed_color ?? DEFAULT_EMBED_COLOR;
  if (cancelled) {
    return {
      title: giveaway.prize,
      description: "🚫 This giveaway was cancelled.",
      color,
    };
  }

  const winnerLines =
    giveaway.winner_ids.length > 0
      ? giveaway.winner_ids.map((id) => `<@${id}>`).join(", ")
      : "No valid entries — no winner could be selected.";

  return {
    title: giveaway.prize,
    description: `🎉 Giveaway ended!\n**Winner(s):** ${winnerLines}`,
    color,
  };
}

function buildWinnerAnnouncementPayload(giveaway: Giveaway) {
  const mentions = giveaway.winner_ids.map((id) => `<@${id}>`).join(", ");
  return {
    content: `🎉 Congratulations ${mentions}! You won **${giveaway.prize}**!`,
    allowed_mentions: { users: giveaway.winner_ids },
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

  const updated = (await giveaways.find(giveawayId))!;

  if (updated.message_id) {
    await editChannelMessage(updated.channel_id, updated.message_id, {
      embeds: [buildEndedEmbed(updated, opts.cancelled)],
      components: [],
    }).catch(() => null);
  }

  if (!opts.cancelled) {
    await sendChannelMessage(updated.channel_id, buildWinnerAnnouncementPayload(updated)).catch(() => null);
  }

  return updated;
}

/**
 * Re-rolls winner(s) for an already-ended giveaway, excluding everyone who has ever won it before (across all
 * previous rerolls too). Posts a fresh winner announcement; does not touch the original giveaway message.
 */
export async function rerollGiveaway(giveawayId: number): Promise<Giveaway> {
  const giveaway = await giveaways.find(giveawayId);
  if (!giveaway) {
    throw new Error(`Giveaway ${giveawayId} not found`);
  }
  if (giveaway.status !== "ended") {
    throw new Error("Only an ended giveaway can be rerolled");
  }

  const newWinnerIds = await rollWinners(giveawayId, giveaway.winner_count, giveaway.winner_ids);
  const allWinnerIds = [...giveaway.winner_ids, ...newWinnerIds];

  await giveaways.update(giveawayId, { winner_ids: allWinnerIds });

  const updated = (await giveaways.find(giveawayId))!;

  if (newWinnerIds.length > 0) {
    await sendChannelMessage(updated.channel_id, {
      content: `🎉 Giveaway rerolled for **${updated.prize}**! New winner(s): ${newWinnerIds.map((id) => `<@${id}>`).join(", ")}`,
      allowed_mentions: { users: newWinnerIds },
    }).catch(() => null);
  }

  return updated;
}
