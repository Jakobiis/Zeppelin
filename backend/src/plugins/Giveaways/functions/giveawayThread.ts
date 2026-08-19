import { ChannelType, EmbedBuilder, Snowflake, ThreadChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";
import { getOrFetchGuildMember } from "../../../utils/getOrFetchGuildMember.js";
import { buildDeleteThreadButtonRow } from "./buildGiveawayMessage.js";
import { GiveawaysPluginType } from "../types.js";

/**
 * Creates a private thread for one specific winner + the host, on demand from the "Create Thread" button on the
 * winner announcement. Each winner gets their own — they never share one, since prize coordination (shipping
 * address, account details, etc.) is winner-specific. Manager-role holders aren't added or pinged here at all —
 * a "manage giveaways" role is expected to already have Manage Threads on the channel, which is enough for its
 * holders to see/join the private thread without notifying all of them every time a winner opens one.
 */
export async function createGiveawayThread(pluginData: GuildPluginData<GiveawaysPluginType>, giveaway: Giveaway, winnerId: string): Promise<ThreadChannel> {
  // Private threads are a GuildText-only feature — Discord doesn't support them in announcement/forum/etc.
  // channels, so unlike the rest of this codebase's channel handling there's no broader "text-based" check here.
  const channel = pluginData.guild.channels.cache.get(giveaway.channel_id as Snowflake);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("The giveaway's channel no longer exists or doesn't support private threads");
  }

  const winnerMember = await getOrFetchGuildMember(pluginData.guild, winnerId);
  const winnerName = winnerMember?.displayName ?? winnerMember?.user.username ?? winnerId;

  const thread = await channel.threads.create({
    name: `${giveaway.prize} - ${winnerName}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Giveaway #${giveaway.id} winner thread for ${winnerId}`,
  });

  // Host + this one winner always get in explicitly so they're guaranteed access even if they don't otherwise
  // have Manage Threads on the channel. The holder (if this giveaway is staff-held) joins them, since they're
  // the one who'll actually be handing the prize over.
  const memberIds = giveaway.holder_id ? [giveaway.host_id, giveaway.holder_id, winnerId] : [giveaway.host_id, winnerId];
  for (const userId of memberIds) {
    await thread.members.add(userId).catch(() => null);
  }

  const pingMentions = memberIds.map((id) => `<@${id}>`).join(" ");
  const descriptionLines = [`This private thread is for sorting out **${giveaway.prize}**.`, `Host: <@${giveaway.host_id}>`];
  if (giveaway.holder_id) {
    descriptionLines.push(`Holder: <@${giveaway.holder_id}>`);
  }
  descriptionLines.push(`Winner: <@${winnerId}>`);

  const infoEmbed = new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(`Giveaway thread — ${giveaway.prize}`)
    .setDescription(descriptionLines.join("\n"));

  await thread.send({
    content: pingMentions,
    embeds: [infoEmbed],
    components: [buildDeleteThreadButtonRow(giveaway.id, winnerId)],
    allowedMentions: { users: memberIds },
  });

  return thread;
}
