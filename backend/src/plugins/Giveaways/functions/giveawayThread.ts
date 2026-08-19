import { ChannelType, EmbedBuilder, Snowflake, ThreadChannel } from "discord.js";
import { GuildPluginData } from "vety";
import { Giveaway } from "../../../data/entities/Giveaway.js";
import { DEFAULT_EMBED_COLOR } from "../../../utils/getGuildEmbedColor.js";
import { refreshMembersIfNeeded } from "../../Utility/refreshMembers.js";
import { buildDeleteThreadButtonRow } from "./buildGiveawayMessage.js";
import { GiveawaysPluginType } from "../types.js";

/**
 * Creates a private thread for one specific winner + the host (+ current manager-role holders), on demand from
 * the "Create Thread" button on the winner announcement. Each winner gets their own — they never share one,
 * since prize coordination (shipping address, account details, etc.) is winner-specific. Bot-process-only
 * (unlike everything in finalizeGiveaway.ts) — it needs a live guild member cache to resolve who currently
 * holds a manager role, which the API process has no cheap way to do.
 */
export async function createGiveawayThread(pluginData: GuildPluginData<GiveawaysPluginType>, giveaway: Giveaway, winnerId: string): Promise<ThreadChannel> {
  // Private threads are a GuildText-only feature — Discord doesn't support them in announcement/forum/etc.
  // channels, so unlike the rest of this codebase's channel handling there's no broader "text-based" check here.
  const channel = pluginData.guild.channels.cache.get(giveaway.channel_id as Snowflake);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("The giveaway's channel no longer exists or doesn't support private threads");
  }

  const thread = await channel.threads.create({
    name: `🎉 ${giveaway.prize}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Giveaway #${giveaway.id} winner thread for ${winnerId}`,
  });

  // Host + this one winner always get in; every *current* holder of a manager role also gets added explicitly
  // rather than relying on their role having Manage Threads on the channel (which isn't guaranteed, and this
  // needs to work regardless of how the rest of the server's permissions happen to be set up).
  const memberIds = new Set<string>([giveaway.host_id, winnerId]);

  const config = pluginData.config.get();
  if (config.manager_roles.length > 0) {
    await refreshMembersIfNeeded(pluginData.guild);
    for (const member of pluginData.guild.members.cache.values()) {
      if (member.roles.cache.some((role) => config.manager_roles.includes(role.id))) {
        memberIds.add(member.id);
      }
    }
  }

  for (const userId of memberIds) {
    await thread.members.add(userId).catch(() => null);
  }

  const pingMentions = `<@${giveaway.host_id}> <@${winnerId}>`;
  const infoEmbed = new EmbedBuilder()
    .setColor(giveaway.embed_color ?? DEFAULT_EMBED_COLOR)
    .setTitle(`Giveaway thread — ${giveaway.prize}`)
    .setDescription(
      [`This private thread is for sorting out **${giveaway.prize}**.`, `Host: <@${giveaway.host_id}>`, `Winner: <@${winnerId}>`].join("\n"),
    );

  await thread.send({
    content: pingMentions,
    embeds: [infoEmbed],
    components: [buildDeleteThreadButtonRow(giveaway.id, winnerId)],
    allowedMentions: { users: [...memberIds] },
  });

  return thread;
}
