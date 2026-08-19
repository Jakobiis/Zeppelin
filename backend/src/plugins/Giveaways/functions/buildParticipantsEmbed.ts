import { EmbedBuilder } from "discord.js";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { GiveawayEntries } from "../../../data/GiveawayEntries.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";

const giveawayEntries = new GiveawayEntries();

// Keeps the embed description comfortably under Discord's 4096-char limit even for a giveaway with hundreds of
// entrants — anyone past this cutoff is summarized in a trailing "...and N more" line instead of listed.
const MAX_LISTED_PARTICIPANTS = 40;

export async function buildParticipantsEmbed(giveaway: Pick<Giveaway, "id" | "prize" | "embed_color">): Promise<EmbedBuilder> {
  const entries = await giveawayEntries.getForGiveaway(giveaway.id);
  entries.sort((a, b) => b.entries - a.entries);

  const totalEntries = entries.reduce((sum, entry) => sum + entry.entries, 0);

  const lines = entries
    .slice(0, MAX_LISTED_PARTICIPANTS)
    .map((entry, index) => `**${index + 1}.** <@${entry.user_id}> — ${entry.entries} ${entry.entries === 1 ? "entry" : "entries"}`);

  if (entries.length > MAX_LISTED_PARTICIPANTS) {
    lines.push(`...and ${entries.length - MAX_LISTED_PARTICIPANTS} more`);
  }

  return new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(`Participants — ${giveaway.prize}`)
    .setDescription(
      entries.length > 0
        ? `**${entries.length}** participant${entries.length === 1 ? "" : "s"}, **${totalEntries}** total entries\n\n${lines.join("\n")}`
        : "No one has entered yet.",
    );
}
