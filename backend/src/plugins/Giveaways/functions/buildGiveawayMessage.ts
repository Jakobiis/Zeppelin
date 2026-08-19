import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import moment from "moment-timezone";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { buildCustomId } from "../../../utils/buildCustomId.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";

// "(2x) Prize" for multi-winner giveaways, just "Prize" for a single winner — used for the embed title both
// while running (buildGiveawayEmbed) and once ended (finalizeGiveaway.ts's buildEndedEmbed).
export function formatGiveawayTitle(prize: string, winnerCount: number): string {
  return winnerCount > 1 ? `(${winnerCount}x) ${prize}` : prize;
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
export function buildGiveawayEmbed(giveaway: Pick<Giveaway, "prize" | "host_id" | "winner_count" | "ends_at" | "embed_color" | "required_role_ids" | "message_requirement" | "extra_entries">): EmbedBuilder {
  const requirementLines: string[] = [];
  if (giveaway.required_role_ids.length > 0) {
    requirementLines.push(`Requires: ${giveaway.required_role_ids.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (giveaway.message_requirement) {
    requirementLines.push(`Requires: ${giveaway.message_requirement.count} messages (${giveaway.message_requirement.period})`);
  }

  const extraEntryEntries = Object.entries(giveaway.extra_entries);
  if (extraEntryEntries.length > 0) {
    const bonusLine = extraEntryEntries.map(([roleId, bonus]) => `<@&${roleId}> +${bonus}`).join(", ");
    requirementLines.push(`Bonus entries: ${bonusLine}`);
  }

  const endsAtUnix = moment.utc(giveaway.ends_at).unix();

  return new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(formatGiveawayTitle(giveaway.prize, giveaway.winner_count))
    .setDescription(
      [
        `Click 🎉 **Enter** below to join!`,
        `Winners: **${giveaway.winner_count}**`,
        `Host: <@${giveaway.host_id}>`,
        `Ends: <t:${endsAtUnix}:R> (<t:${endsAtUnix}:f>)`,
        ...requirementLines,
      ].join("\n"),
    );
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

// On the winner-announcement message, alongside the Claim button when there's a claim requirement — clicking
// creates the private host/winner(s)/manager thread (see functions/giveawayThread.ts, bot-process-only since
// it needs a live guild member cache).
export function buildWinnerAnnouncementButtons(giveawayId: number, includeClaim: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (includeClaim) {
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
        .setLabel("Claim Prize")
        .setCustomId(buildCustomId("giveawayClaim", { id: giveawayId })),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🧵")
      .setLabel("Create Thread")
      .setCustomId(buildCustomId("giveawayThread", { id: giveawayId })),
  );
  return [row];
}

// Posted as part of the thread's first message (see functions/giveawayThread.ts) — restricted to manager_roles
// at the interaction-handling end, not here (a button alone can't enforce who clicks it). Carries the winner ID
// since each winner's thread is tracked separately in winner_thread_ids.
export function buildDeleteThreadButtonRow(giveawayId: number, winnerId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
      .setLabel("Delete Thread")
      .setCustomId(buildCustomId("giveawayThreadDelete", { id: giveawayId, winner: winnerId })),
  );
}
