import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import moment from "moment-timezone";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { buildCustomId } from "../../../utils/buildCustomId.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";

/**
 * The embed + "Enter" button for a running giveaway. Deliberately doesn't show live entry counts/requirements
 * detail beyond a summary line — the entry button itself is the source of truth for whether someone qualifies.
 */
export function buildGiveawayEmbed(giveaway: Pick<Giveaway, "prize" | "host_id" | "winner_count" | "ends_at" | "embed_color" | "required_role_ids" | "message_requirement">): EmbedBuilder {
  const requirementLines: string[] = [];
  if (giveaway.required_role_ids.length > 0) {
    requirementLines.push(`Requires: ${giveaway.required_role_ids.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (giveaway.message_requirement) {
    requirementLines.push(`Requires: ${giveaway.message_requirement.count} messages (${giveaway.message_requirement.period})`);
  }

  const endsAtUnix = moment.utc(giveaway.ends_at).unix();

  return new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(giveaway.prize)
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
  );
}
