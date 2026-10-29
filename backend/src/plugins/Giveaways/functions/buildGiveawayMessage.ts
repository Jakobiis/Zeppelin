import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import moment from "moment-timezone";
import { Giveaway, GiveawayCountRange } from "../../../data/entities/Giveaway.js";
import { buildCustomId } from "../../../utils/buildCustomId.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";

export const GIVEAWAY_DESCRIPTION_MAX_LENGTH = 1000;

// Discord only renders http(s) image URLs in embeds, and rejects the whole embed if one is malformed — so this is
// checked up front (command + dashboard API) rather than letting the giveaway message fail to post.
export function isValidGiveawayImageUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatRangeLabel(range: GiveawayCountRange): string {
  return range.max != null ? `${range.min}-${range.max}` : `${range.min}+`;
}

// winner_ids is append-only full history (every manual/claim-expiry reroll adds to it, never removes) — this
// is "who actually still has the prize right now", i.e. winner_ids minus anyone whose claim window expired.
// Used for display anywhere that shouldn't keep listing a forfeited winner as if they still won (GiveawayListCmd,
// the dashboard's finished-giveaways list) — not needed right at finalize/reroll time, when winner_ids is
// necessarily already current.
export function currentWinnerIds(giveaway: Pick<Giveaway, "winner_ids" | "expired_winner_ids">): string[] {
  return giveaway.winner_ids.filter((id) => !giveaway.expired_winner_ids.includes(id));
}

/**
 * The embed + "Enter" button for a running giveaway. Deliberately doesn't show live entry counts/requirements
 * detail beyond a summary line — the entry button itself is the source of truth for whether someone qualifies.
 */
export function buildGiveawayEmbed(
  giveaway: Pick<
    Giveaway,
    | "prize"
    | "host_id"
    | "winner_count"
    | "ends_at"
    | "embed_color"
    | "required_role_ids"
    | "message_requirement"
    | "counter_requirement"
    | "coins_requirement"
    | "required_supporter_level"
    | "blacklisted_supporter_levels"
    | "extra_entries"
    | "image_url"
    | "description"
  >,
): EmbedBuilder {
  const requirementLines: string[] = [];
  if (giveaway.required_role_ids.length > 0) {
    requirementLines.push(`Requires: ${giveaway.required_role_ids.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (giveaway.message_requirement) {
    requirementLines.push(`Requires: ${formatRangeLabel(giveaway.message_requirement)} messages (${giveaway.message_requirement.period})`);
  }
  if (giveaway.counter_requirement) {
    // Friendly fixed label rather than the raw counter name (e.g. "activity") — the concept staff configure
    // this against (see zGiveawaysConfig.activity_counter_name) is always "activity points" from a player's
    // perspective, even though the actual counter key underneath is guild-configurable.
    requirementLines.push(`Requires: ${formatRangeLabel(giveaway.counter_requirement)} activity points`);
  }
  if (giveaway.coins_requirement) {
    requirementLines.push(`Requires: ${formatRangeLabel(giveaway.coins_requirement)} coins`);
  }
  if (giveaway.required_supporter_level != null) {
    const max = giveaway.required_supporter_level;
    requirementLines.push(`Requires: supporter level ${max === 1 ? "1" : `1-${max}`}`);
  }
  if (giveaway.blacklisted_supporter_levels?.length) {
    requirementLines.push(`Excluded: supporter level ${giveaway.blacklisted_supporter_levels.join(", ")}`);
  }

  const extraEntryEntries = Object.entries(giveaway.extra_entries);
  if (extraEntryEntries.length > 0) {
    // Blank line first so the bonus list doesn't run straight on from the end date/requirements above it
    requirementLines.push("", "**Bonus entries:**", ...extraEntryEntries.map(([roleId, bonus]) => `<@&${roleId}> +${bonus}`));
  }

  const endsAtUnix = moment.utc(giveaway.ends_at).unix();

  const embed = new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(giveaway.prize)
    .setDescription(
      [
        `Winners: **${giveaway.winner_count}**`,
        `Host: <@${giveaway.host_id}>`,
        `Ends: <t:${endsAtUnix}:R> (<t:${endsAtUnix}:f>)`,
        ...requirementLines,
        ...(giveaway.description ? ["", giveaway.description] : []),
      ].join("\n"),
    );
  if (giveaway.image_url) {
    embed.setImage(giveaway.image_url);
  }
  return embed;
}

export function buildGiveawayButtons(giveawayId: number, entryCount: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎉")
      .setLabel(`Enter (${entryCount})`)
      .setCustomId(buildCustomId("giveaway", { id: giveawayId }))
      .setDisabled(disabled),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👥")
      .setLabel("Participants")
      .setCustomId(buildCustomId("giveawayParticipants", { id: giveawayId })),
  );
}

// On the winner-announcement message — clicking creates the private host/winner(+holder) thread (see
// functions/giveawayThread.ts, bot-process-only since it needs a live guild member cache). This is the winner's
// only action now: opening the thread doubles as "showing up" for a claim requirement (see claimGiveaway.ts's
// pauseClaimDeadline) — there's no separate Claim button, since actually confirming the prize was received is a
// host/holder call made from inside the thread (see buildGiveawayThreadActionRows below), not the winner's.
export function buildWinnerAnnouncementButtons(giveawayId: number): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎉")
      .setLabel("Claim Prize")
      .setCustomId(buildCustomId("giveawayThread", { id: giveawayId })),
  );
  return [row];
}

// Posted as part of the thread's first message (see functions/giveawayThread.ts). Neither button's permission is
// enforced here (a button alone can't restrict who clicks it) — see giveawayButtonInteraction.ts:
// "Confirm Claimed" is restricted to the giveaway's host/holder (whoever actually hands the prize over) — shown
// on every winner thread regardless of claim_time_ms, since that setting only controls the reroll deadline, not
// whether a handoff can be confirmed; "Delete Thread" is restricted to manager_roles, giving them a final look
// before closing things out. Both carry the winner ID since each winner's thread is tracked separately in
// winner_thread_ids. includeConfirmClaim is only false once the claim's already been confirmed (see
// giveawayButtonInteraction.ts's "giveawayThreadConfirmClaim" handler re-rendering without it).
export function buildGiveawayThreadActionRows(giveawayId: number, winnerId: string, includeConfirmClaim: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (includeConfirmClaim) {
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
        .setLabel("Confirm Claimed")
        .setCustomId(buildCustomId("giveawayThreadConfirmClaim", { id: giveawayId, winner: winnerId })),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
      .setLabel("Delete Thread")
      .setCustomId(buildCustomId("giveawayThreadDelete", { id: giveawayId, winner: winnerId })),
  );
  return [row];
}
